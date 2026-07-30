import os
import json
import threading
import numpy as np
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

try:
    from osgeo import gdal
except ImportError:
    try:
        import gdal
    except ImportError:
        from gdal_compat import gdal


def validate_output_tiff(filepath: str, expected_nodata: Optional[float] = -9999.0) -> Tuple[bool, Optional[str]]:
    """
    Validates GeoTIFF output files against all 11 scientific & structural criteria:
    - File exists
    - File size > 0
    - GDAL opens successfully
    - One raster band
    - Float32 datatype
    - Width > 0, Height > 0
    - Projection exists
    - Geotransform exists
    - nodata = -9999
    - Contains at least one valid (non-nodata) pixel
    """
    if not os.path.exists(filepath):
        return False, f"Output TIFF file does not exist: {filepath}"

    if os.path.getsize(filepath) == 0:
        return False, f"Output TIFF file is 0 bytes: {filepath}"

    ds = None
    try:
        ds = gdal.Open(filepath, gdal.GA_ReadOnly)
        if ds is None:
            return False, f"GDAL failed to open GeoTIFF: {filepath}"

        if ds.RasterCount != 1:
            return False, f"Output GeoTIFF must have exactly 1 band, found {ds.RasterCount} in {filepath}"

        width = ds.RasterXSize
        height = ds.RasterYSize
        if width <= 0 or height <= 0:
            return False, f"Invalid raster dimensions ({width}x{height}) in {filepath}"

        projection = ds.GetProjection()
        if not projection:
            return False, f"GeoTIFF lacks CRS projection information: {filepath}"

        gt = ds.GetGeoTransform()
        if not gt or gt == (0.0, 1.0, 0.0, 0.0, 0.0, 1.0):
            return False, f"GeoTIFF lacks valid geotransform bounds: {filepath}"

        band = ds.GetRasterBand(1)
        if band is None:
            return False, f"GeoTIFF has no raster band 1: {filepath}"

        if band.DataType != gdal.GDT_Float32:
            return False, f"GeoTIFF data type must be Float32 (GDT_Float32), found type {band.DataType} in {filepath}"

        actual_nodata = band.GetNoDataValue()
        if actual_nodata is None:
            return False, f"Output raster does not define a nodata value in {filepath}"

        if expected_nodata is not None and abs(actual_nodata - expected_nodata) > 1e-4:
            return False, (
                f"Unexpected nodata value in {filepath}: expected {expected_nodata}, "
                f"found {actual_nodata}"
            )

        # Verify at least one valid (non-nodata) pixel exists in the raster
        has_valid_pixel = False
        block_step = 2048
        for yoff in range(0, height, block_step):
            ysize = min(block_step, height - yoff)
            for xoff in range(0, width, block_step):
                xsize = min(block_step, width - xoff)
                arr = band.ReadAsArray(xoff, yoff, xsize, ysize)
                if arr is not None and np.any(arr != actual_nodata):
                    has_valid_pixel = True
                    break
            if has_valid_pixel:
                break

        if not has_valid_pixel:
            return False, f"Output GeoTIFF contains zero valid (non-nodata) pixels in {filepath}"

    except Exception as e:
        return False, f"Exception validating GeoTIFF {filepath}: {e}"
    finally:
        if ds is not None:
            ds = None  # Force close GDAL dataset handle in ALL code paths

    return True, None


class ProcessingTracker:
    """
    Manages JSON Lines processing records (backend/logs/processing_records.jsonl).
    Maintains read-only fallback compatibility with legacy processed_files.txt.
    Thread-safe implementation using threading.Lock().
    """
    def __init__(self, jsonl_log_path: Path, legacy_processed_txt: Optional[Path] = None):
        self.jsonl_path = Path(jsonl_log_path)
        self.legacy_txt_path = Path(legacy_processed_txt) if legacy_processed_txt else None
        self._lock = threading.Lock()

        self.processed_zips: Set[str] = set()
        self.skipped_outside_india_zips: Set[str] = set()
        self.records: Dict[str, dict] = {}

        self._load_records()

    def _load_records(self):
        # 1. Read legacy processed_files.txt read-only (if present)
        if self.legacy_txt_path and self.legacy_txt_path.exists():
            try:
                with open(self.legacy_txt_path, "r", encoding="utf-8") as f:
                    for line in f:
                        zname = line.strip()
                        if zname:
                            self.processed_zips.add(zname)
            except Exception as e:
                print(f"Warning: Could not read legacy processed file list: {e}")

        # 2. Read JSON Lines records if present (overrides / enriches legacy)
        if self.jsonl_path.exists():
            try:
                with open(self.jsonl_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        rec = json.loads(line)
                        zname = rec.get("zip_name")
                        status = rec.get("status")
                        if zname and status:
                            self.records[zname] = rec
                            if status == "PROCESSED":
                                self.processed_zips.add(zname)
                            elif status == "SKIPPED" and "Outside India" in rec.get("reason", ""):
                                self.skipped_outside_india_zips.add(zname)
            except Exception as e:
                print(f"Warning: Could not load JSONL processing records: {e}")

    def is_processed(self, zip_name: str) -> bool:
        with self._lock:
            return zip_name in self.processed_zips

    def is_skipped_outside_india(self, zip_name: str) -> bool:
        with self._lock:
            return zip_name in self.skipped_outside_india_zips

    def record_status(
        self,
        zip_path: str,
        status: str,
        reason: str,
        products_found: int = 0,
        tiles_attempted: int = 0,
        tiles_succeeded: int = 0,
        tiles_failed: int = 0,
        outputs_created: Optional[List[str]] = None,
    ) -> dict:
        zip_name = os.path.basename(zip_path)
        record = {
            "zip_path": zip_path,
            "zip_name": zip_name,
            "status": status,
            "reason": reason,
            "products_found": products_found,
            "tiles_attempted": tiles_attempted,
            "tiles_succeeded": tiles_succeeded,
            "tiles_failed": tiles_failed,
            "outputs_created": outputs_created or [],
            "processed_at": datetime.utcnow().isoformat() + "Z",
        }

        with self._lock:
            # Update in-memory index
            self.records[zip_name] = record
            if status == "PROCESSED":
                self.processed_zips.add(zip_name)
            elif status == "SKIPPED" and "Outside India" in reason:
                self.skipped_outside_india_zips.add(zip_name)

            # Append to JSONL file using safe append semantics (flush + fsync)
            self.jsonl_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.jsonl_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
                f.flush()
                os.fsync(f.fileno())

        return record

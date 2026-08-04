import os
import json
import hashlib
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

try:
    import rasterio
    from rasterio.warp import transform_bounds
except ImportError:
    rasterio = None

logger = logging.getLogger(__name__)

class ResultRegistry:
    """
    Central Authoritative Result Registry for all BhuDrishti raster outputs.
    Registers generated tile NDVIs, Daywise mosaics, Composite mosaics, and loaded existing rasters.
    Prevents path traversal, enforces allowed-root directory security, and supports persistent recovery.
    """
    def __init__(self, output_root: Optional[Path] = None):
        if output_root is None:
            try:
                from config import PipelineConfig
                self.output_root = PipelineConfig.from_env().output_root_directory.resolve()
            except Exception:
                self.output_root = Path("data/output").resolve()
        else:
            self.output_root = output_root.resolve()

        self._lock = threading.Lock()
        self._registry: Dict[str, dict] = {}
        self.storage_file = self.output_root / "logs" / "result_registry.json"
        self._load_persisted_registry()

    def _generate_result_id(self, file_path: Path) -> str:
        """Generates a stable, deterministic result ID based on normalized path and file mtime."""
        abs_p = str(file_path.resolve())
        mtime = os.path.getmtime(abs_p) if file_path.exists() else 0
        raw_key = f"{abs_p}:{mtime}"
        return f"res_{hashlib.md5(raw_key.encode('utf-8')).hexdigest()[:12]}"

    def is_safe_path(self, path: Path | str) -> bool:
        """Validates that path exists, is a file, is a GeoTIFF, and is contained inside allowed data hierarchy."""
        try:
            p = Path(path).resolve()
            if not p.exists() or not p.is_file():
                return False
            
            # Ensure it is a valid GeoTIFF raster
            if not p.name.lower().endswith((".tif", ".tiff")):
                return False
            
            # Reject OS system directories for security
            abs_str = str(p).lower()
            forbidden_system = ["c:\\windows", "c:\\program files", "c:\\program files (x86)", "/etc", "/usr", "/var", "/sys", "/proc"]
            if any(abs_str.startswith(sys_p) for sys_p in forbidden_system):
                return False
            
            # Prevent path traversal outside repository data/output directory hierarchy
            allowed = self.output_root.resolve()
            data_root = allowed.parent
            p_str = str(p).lower()
            is_inside = (
                allowed in p.parents
                or data_root in p.parents
                or p_str.startswith(str(allowed).lower())
                or p_str.startswith(str(data_root).lower())
            )
            
            if not is_inside:
                logger.warning(f"Registration rejected for unsafe path: {p}")
                return False

            return True
        except Exception:
            return False

    def register_raster(
        self,
        raster_path: str | Path,
        processing_type: str = "daywise",
        satellite: str = "ALL",
        target_date: Optional[str] = None,
        year: Optional[int] = None,
        month: Optional[int] = None,
        composite_period: Optional[str] = None,
        job_id: Optional[str] = None,
        source_manifest: Optional[List[dict]] = None
    ) -> Optional[dict]:
        """
        Registers a raster in the central registry and calculates spatial bounds, CRS, and metadata.
        """
        p = Path(raster_path).resolve()
        if not self.is_safe_path(p):
            logger.warning(f"Registration rejected for unsafe path: {p}")
            return None

        result_id = self._generate_result_id(p)
        filename = p.name
        file_size = p.stat().st_size
        mtime = p.stat().st_mtime

        # Inspect GeoTIFF using rasterio if available
        bounds_dict = {"min_lon": 68.0, "min_lat": 6.0, "max_lon": 97.0, "max_lat": 37.0}
        crs_str = "EPSG:4326"
        width, height = 1000, 1000
        nodata_val = -9999.0
        computed_stats = {}
        computed_affine = {}
        computed_native_bounds = {}

        if rasterio:
            try:
                with rasterio.open(p) as src:
                    width = src.width
                    height = src.height
                    nodata_val = float(src.nodata) if src.nodata is not None else -9999.0
                    crs_str = str(src.crs) if src.crs else "EPSG:4326"
                    if src.crs:
                        wgs84_bounds = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
                        bounds_dict = {
                            "min_lon": float(wgs84_bounds[0]),
                            "min_lat": float(wgs84_bounds[1]),
                            "max_lon": float(wgs84_bounds[2]),
                            "max_lat": float(wgs84_bounds[3]),
                        }
                    
                    # Compute downsampled array statistics for metadata & analytics dashboard
                    try:
                        step = max(1, min(width, height) // 1000)
                        import numpy as np
                        arr = src.read(1, out_shape=(height // step, width // step))
                        valid_mask = ~np.isnan(arr) & (arr != nodata_val) & (arr > -9998.0) & (arr >= -1.0) & (arr <= 1.0)
                        valid_vals = arr[valid_mask]

                        if valid_vals.size > 0:
                            min_val = float(np.min(valid_vals))
                            max_val = float(np.max(valid_vals))
                            mean_val = float(np.mean(valid_vals))
                            median_val = float(np.median(valid_vals))
                            std_val = float(np.std(valid_vals))
                            valid_cnt = int(valid_vals.size)
                            total_cnt = int(arr.size)
                            nodata_cnt = total_cnt - valid_cnt
                            veg_cnt = int(np.sum(valid_vals >= 0.2))
                            veg_pct = (veg_cnt / valid_cnt * 100.0) if valid_cnt > 0 else 0.0

                            counts, bin_edges = np.histogram(valid_vals, bins=20, range=(-1.0, 1.0))
                            histogram = []
                            for i in range(len(counts)):
                                histogram.append({
                                    "binStart": float(bin_edges[i]),
                                    "binEnd": float(bin_edges[i+1]),
                                    "count": int(counts[i])
                                })

                            computed_stats = {
                                "minimum": min_val,
                                "maximum": max_val,
                                "mean": mean_val,
                                "median": median_val,
                                "stdDev": std_val,
                                "standardDeviation": std_val,
                                "validPixelCount": valid_cnt,
                                "noDataPixelCount": nodata_cnt,
                                "vegetationPercentage": veg_pct,
                                "histogram": histogram
                            }

                        bounds_n = src.bounds
                        res_n = src.res
                        computed_affine = {
                            "originX": float(bounds_n.left),
                            "originY": float(bounds_n.top),
                            "pixelWidth": float(res_n[0]),
                            "pixelHeight": float(res_n[1]),
                            "crs": crs_str
                        }
                        computed_native_bounds = {
                            "west": float(bounds_n.left),
                            "south": float(bounds_n.bottom),
                            "east": float(bounds_n.right),
                            "north": float(bounds_n.top)
                        }
                    except Exception as st_err:
                        logger.warning(f"Could not compute array stats: {st_err}")

            except Exception as err:
                logger.warning(f"Could not read rasterio bounds for {p}: {err}")

        # Check for sidecar JSON metadata
        meta_json_path = p.with_name(p.stem + "_metadata.json")
        sidecar_meta = {}
        if meta_json_path.exists():
            try:
                with open(meta_json_path, "r", encoding="utf-8") as f:
                    sidecar_meta = json.load(f)
            except Exception:
                pass

        category = "PERIODIC_MOSAIC" if ("MOSAIC" in filename.upper() or "COMPOSITE" in filename.upper()) else "NDVI_TILE"

        record = {
            "result_id": result_id,
            "job_id": job_id or "job_manual",
            "filename": filename,
            "absolute_path": str(p),
            "size_bytes": file_size,
            "mtime": mtime,
            "file_type": "image/tiff",
            "created_at": datetime.utcfromtimestamp(mtime).isoformat() + "Z",
            "category": category,
            "processing_type": processing_type,
            "satellite": satellite,
            "target_date": target_date,
            "year": year,
            "month": month,
            "composite_period": composite_period,
            "crs": crs_str,
            "bounds": bounds_dict,
            "width": width,
            "height": height,
            "nodata": nodata_val,
            "statistics": computed_stats,
            "affine": computed_affine,
            "nativeBounds": computed_native_bounds,
            "source_manifest": source_manifest or sidecar_meta.get("source_manifest", []),
            "version_hash": hashlib.md5(f"{mtime}:{file_size}".encode()).hexdigest()[:8]
        }

        with self._lock:
            self._registry[result_id] = record
            self._persist_registry_locked()

        return record

    def get_result(self, result_id: str) -> Optional[dict]:
        """Retrieves result record by result_id after security verification."""
        with self._lock:
            record = self._registry.get(result_id)
            if not record:
                return None
            p = Path(record["absolute_path"])
            if not self.is_safe_path(p):
                logger.warning(f"Result {result_id} path check failed on retrieval: {p}")
                return None
            return record

    def find_by_path(self, raster_path: str | Path) -> Optional[dict]:
        p = str(Path(raster_path).resolve())
        with self._lock:
            for record in self._registry.values():
                if record["absolute_path"] == p:
                    return record
        return None

    def list_results(self) -> List[dict]:
        with self._lock:
            valid_list = []
            for record in self._registry.values():
                if self.is_safe_path(Path(record["absolute_path"])):
                    valid_list.append(record)
            return valid_list

    def _persist_registry_locked(self):
        try:
            self.storage_file.parent.mkdir(parents=True, exist_ok=True)
            serializable = {k: v for k, v in self._registry.items()}
            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(serializable, f, indent=2)
        except Exception as err:
            logger.warning(f"Could not persist result registry: {err}")

    def _load_persisted_registry(self):
        if not self.storage_file.exists():
            return
        try:
            with open(self.storage_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    self._registry = data
        except Exception as err:
            logger.warning(f"Could not load persisted result registry: {err}")

    def scan_output_directory(self):
        """Scans output root directory and auto-registers existing valid TIFFs on startup."""
        if not self.output_root.exists():
            return
        for root, _, files in os.walk(self.output_root):
            for f in files:
                if f.lower().endswith((".tif", ".tiff")) and not f.endswith(".inprogress.tif"):
                    abs_p = Path(root) / f
                    self.register_raster(abs_p)

# Global Singleton Instance
_registry_instance: Optional[ResultRegistry] = None

def get_result_registry() -> ResultRegistry:
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = ResultRegistry()
        _registry_instance.scan_output_directory()
    return _registry_instance

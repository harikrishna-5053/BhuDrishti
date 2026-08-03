import gc
import json
import logging
import math
import os
import shutil
import tempfile
from typing import Callable, List, Optional, Tuple, Dict, Any
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import Window

logger = logging.getLogger(__name__)

class IndiaMosaicCreator:
    """
    Create an EPSG:4326 NDVI mosaic using Maximum Value Composite (MVC).
    Features:
    - Accepts inputs across different UTM zones and reprojects to EPSG:4326.
    - NoData remains -9999.0.
    - Overlapping pixels retain maximum NDVI value.
    - Progress callbacks for integration with FastAPI background job system.
    - Controlled blockwise memmap flushing and atomic output creation.
    - Dynamic powers-of-two internal overview generation.
    - Complete source manifest output JSON.
    """
    def __init__(
        self,
        target_crs: str = "EPSG:4326",
        output_resolution: float = 0.0000898315,
        nodata: float = -9999.0,
        num_threads: int = 4,
        resampling = Resampling.nearest,
        keep_temp: bool = False,
        progress_callback: Optional[Callable[[str, int, int, str], None]] = None,
    ):
        self.target_crs = target_crs
        self.output_resolution = float(output_resolution)
        self.nodata = float(nodata)
        self.num_threads = max(1, min(int(num_threads), os.cpu_count() or 4))
        self.resampling = resampling
        self.keep_temp = keep_temp
        self.progress_callback = progress_callback
        self.temp_dir = tempfile.mkdtemp(prefix="india_ndvi_mosaic_")
        self.stats = {
            "total_images": 0,
            "processed": 0,
            "failed": 0,
            "valid_source_pixels": 0,
        }
        logger.info("Temporary mosaic directory created: %s", self.temp_dir)

    def _report_progress(self, stage: str, current: int, total: int, message: str):
        if self.progress_callback:
            try:
                self.progress_callback(stage, current, total, message)
            except Exception as e:
                logger.warning("Progress callback error: %s", e)

    def validate_input_files(self, input_files: List[str]) -> List[str]:
        valid_files = []
        seen_stamps: Dict[str, Tuple[str, float]] = {}

        for file_path in input_files:
            if not file_path:
                continue
            abs_path = os.path.abspath(file_path)
            if not os.path.isfile(abs_path):
                logger.warning("Input file does not exist: %s", abs_path)
                continue
            if not abs_path.lower().endswith((".tif", ".tiff")):
                continue
            
            # De-duplicate identical tile/acquisition files by keeping newest
            fname = os.path.basename(abs_path)
            mtime = os.path.getmtime(abs_path)
            if fname in seen_stamps:
                old_path, old_mtime = seen_stamps[fname]
                if mtime > old_mtime:
                    seen_stamps[fname] = (abs_path, mtime)
            else:
                seen_stamps[fname] = (abs_path, mtime)

        valid_files = sorted([p for p, _ in seen_stamps.values()])
        if not valid_files:
            raise ValueError("No valid NDVI TIFF files were supplied for compositing")
        return valid_files

    def calculate_mosaic_bounds(self, input_files: List[str]) -> Tuple[float, float, float, float]:
        min_lon, min_lat = float("inf"), float("inf")
        max_lon, max_lat = float("-inf"), float("-inf")
        valid_count = 0

        self._report_progress("Calculating Bounds", 0, len(input_files), "Calculating mosaic bounds...")

        for idx, file_path in enumerate(input_files):
            try:
                with rasterio.open(file_path) as src:
                    if src.crs is None:
                        raise ValueError(f"Input raster {file_path} has no CRS")
                    left, bottom, right, top = transform_bounds(
                        src.crs,
                        self.target_crs,
                        *src.bounds,
                        densify_pts=21,
                    )
                    min_lon = min(min_lon, left)
                    min_lat = min(min_lat, bottom)
                    max_lon = max(max_lon, right)
                    max_lat = max(max_lat, top)
                    valid_count += 1
            except Exception as error:
                logger.error("Unable to read bounds from %s: %s", file_path, error)
            
            self._report_progress("Calculating Bounds", idx + 1, len(input_files), f"Inspected bounds {idx + 1}/{len(input_files)}")

        if valid_count == 0:
            raise ValueError("Mosaic bounds could not be calculated from any input raster")

        resolution = self.output_resolution
        min_lon = math.floor(min_lon / resolution) * resolution
        min_lat = math.floor(min_lat / resolution) * resolution
        max_lon = math.ceil(max_lon / resolution) * resolution
        max_lat = math.ceil(max_lat / resolution) * resolution

        logger.info("Mosaic bounds: minLon=%s, minLat=%s, maxLon=%s, maxLat=%s", min_lon, min_lat, max_lon, max_lat)
        return min_lon, min_lat, max_lon, max_lat

    def calculate_output_grid(self, bounds: Tuple[float, float, float, float]):
        min_lon, min_lat, max_lon, max_lat = bounds
        width = int(math.ceil((max_lon - min_lon) / self.output_resolution))
        height = int(math.ceil((max_lat - min_lat) / self.output_resolution))
        
        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid mosaic canvas dimensions: {width} x {height}")

        output_transform = from_origin(min_lon, max_lat, self.output_resolution, self.output_resolution)
        memory_gb = (width * height * np.dtype(np.float32).itemsize) / (1024 ** 3)
        logger.info("Output grid: %d x %d pixels (Memmap size: %.2f GB)", width, height, memory_gb)
        return width, height, output_transform

    def calculate_destination_window(
        self,
        src,
        mosaic_bounds: Tuple[float, float, float, float],
        mosaic_width: int,
        mosaic_height: int,
    ) -> Optional[Window]:
        min_lon, min_lat, max_lon, max_lat = mosaic_bounds
        left, bottom, right, top = transform_bounds(
            src.crs,
            self.target_crs,
            *src.bounds,
            densify_pts=21,
        )
        resolution = self.output_resolution
        col_start = int(math.floor((left - min_lon) / resolution))
        col_stop = int(math.ceil((right - min_lon) / resolution))
        row_start = int(math.floor((max_lat - top) / resolution))
        row_stop = int(math.ceil((max_lat - bottom) / resolution))

        col_start = max(0, col_start)
        row_start = max(0, row_start)
        col_stop = min(mosaic_width, col_stop)
        row_stop = min(mosaic_height, row_stop)

        window_width = col_stop - col_start
        window_height = row_stop - row_start
        if window_width <= 0 or window_height <= 0:
            return None

        return Window(col_off=col_start, row_off=row_start, width=window_width, height=window_height)

    def reproject_and_merge(
        self,
        file_path: str,
        mosaic: np.memmap,
        mosaic_bounds: Tuple[float, float, float, float],
        mosaic_width: int,
        mosaic_height: int,
        mosaic_transform,
    ) -> bool:
        with rasterio.open(file_path) as src:
            if src.crs is None:
                raise ValueError(f"Input raster {file_path} does not contain CRS")
            
            destination_window = self.calculate_destination_window(
                src=src,
                mosaic_bounds=mosaic_bounds,
                mosaic_width=mosaic_width,
                mosaic_height=mosaic_height,
            )
            if destination_window is None:
                logger.warning("File falls outside output canvas: %s", file_path)
                return False

            row_start = int(destination_window.row_off)
            col_start = int(destination_window.col_off)
            window_height = int(destination_window.height)
            window_width = int(destination_window.width)

            destination = np.full((window_height, window_width), self.nodata, dtype=np.float32)
            destination_transform = rasterio.windows.transform(destination_window, mosaic_transform)
            source_nodata = src.nodata if src.nodata is not None else self.nodata

            reproject(
                source=rasterio.band(src, 1),
                destination=destination,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=source_nodata,
                dst_transform=destination_transform,
                dst_crs=self.target_crs,
                dst_nodata=self.nodata,
                resampling=self.resampling,
                num_threads=self.num_threads,
                init_dest_nodata=True,
            )

            destination_valid = np.isfinite(destination) & (destination != self.nodata)
            valid_count = int(np.count_nonzero(destination_valid))

            if valid_count == 0:
                logger.warning("No valid pixels after reprojection for file: %s", file_path)
                return True

            mosaic_window = mosaic[
                row_start : row_start + window_height,
                col_start : col_start + window_width,
            ]
            mosaic_valid = np.isfinite(mosaic_window) & (mosaic_window != self.nodata)

            # Destination is valid and mosaic currently has NoData
            new_pixel_mask = destination_valid & ~mosaic_valid
            mosaic_window[new_pixel_mask] = destination[new_pixel_mask]

            # Destination and mosaic both contain valid NDVI -> Maximum Value Composite
            overlap_mask = destination_valid & mosaic_valid
            mosaic_window[overlap_mask] = np.maximum(
                mosaic_window[overlap_mask],
                destination[overlap_mask],
            )

            self.stats["valid_source_pixels"] += valid_count
            del destination
            del destination_valid
            del mosaic_valid
            del new_pixel_mask
            del overlap_mask
            return True

    def write_mosaic(
        self,
        mosaic: np.memmap,
        output_path: str,
        width: int,
        height: int,
        output_transform,
    ) -> Tuple[int, float]:
        output_path = os.path.abspath(output_path)
        output_directory = os.path.dirname(output_path)
        if output_directory:
            os.makedirs(output_directory, exist_ok=True)

        profile = {
            "driver": "GTiff",
            "height": height,
            "width": width,
            "count": 1,
            "dtype": "float32",
            "crs": self.target_crs,
            "transform": output_transform,
            "nodata": self.nodata,
            "compress": "lzw",
            "predictor": 3,
            "tiled": True,
            "blockxsize": 512,
            "blockysize": 512,
            "BIGTIFF": "IF_NEEDED",
            "interleave": "band",
        }

        valid_pixels = 0
        block_size = 512
        total_blocks = math.ceil(height / block_size) * math.ceil(width / block_size)
        written_blocks = 0

        logger.info("Writing mosaic atomically to: %s", output_path)
        self._report_progress("Writing GeoTIFF", 0, total_blocks, "Writing blocks to GeoTIFF...")

        with rasterio.open(output_path, "w", **profile) as dst:
            for row_start in range(0, height, block_size):
                current_height = min(block_size, height - row_start)
                for col_start in range(0, width, block_size):
                    current_width = min(block_size, width - col_start)
                    block = np.asarray(
                        mosaic[
                            row_start : row_start + current_height,
                            col_start : col_start + current_width,
                        ],
                        dtype=np.float32,
                    )
                    block_valid = np.isfinite(block) & (block != self.nodata)
                    valid_pixels += int(np.count_nonzero(block_valid))
                    block[~np.isfinite(block)] = self.nodata

                    dst.write(
                        block,
                        1,
                        window=Window(
                            col_off=col_start,
                            row_off=row_start,
                            width=current_width,
                            height=current_height,
                        ),
                    )
                    written_blocks += 1
                    if written_blocks % 10 == 0 or written_blocks == total_blocks:
                        self._report_progress(
                            "Writing GeoTIFF",
                            written_blocks,
                            total_blocks,
                            f"Written block {written_blocks}/{total_blocks}",
                        )

            # Generate dynamic powers-of-two internal overviews for fast map rendering
            max_dim = max(width, height)
            overviews = []
            factor = 2
            while max_dim / factor >= 512:
                overviews.append(factor)
                factor *= 2
            if not overviews:
                overviews = [2, 4, 8]
            
            logger.info("Building internal overviews: %s", overviews)
            self._report_progress("Building Overviews", 90, 100, "Building pyramid overviews...")
            dst.build_overviews(overviews, Resampling.nearest)
            dst.update_tags(ns="rio_overview", resampling="nearest")

        total_pixels = width * height
        coverage = (valid_pixels / total_pixels) * 100.0 if total_pixels > 0 else 0.0
        return valid_pixels, coverage

    def write_metadata(
        self,
        output_path: str,
        bounds: Tuple[float, float, float, float],
        width: int,
        height: int,
        valid_pixels: int,
        coverage: float,
        source_manifest: List[Dict[str, Any]],
    ) -> str:
        min_lon, min_lat, max_lon, max_lat = bounds
        metadata = {
            "output_file": os.path.abspath(output_path),
            "crs": self.target_crs,
            "resolution": self.output_resolution,
            "nodata": self.nodata,
            "bounds": {
                "min_lon": min_lon,
                "min_lat": min_lat,
                "max_lon": max_lon,
                "max_lat": max_lat,
            },
            "width": width,
            "height": height,
            "valid_pixels": valid_pixels,
            "coverage_percent": coverage,
            "composite_method": "Maximum Value Composite (MVC)",
            "statistics": self.stats,
            "source_manifest": source_manifest,
        }
        metadata_path = os.path.splitext(output_path)[0] + "_metadata.json"
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4)
        return metadata_path

    def create_mosaic(self, input_files: List[str], output_path: str) -> str:
        input_files = self.validate_input_files(input_files)
        self.stats["total_images"] = len(input_files)
        logger.info("Creating EPSG:4326 mosaic from %d inputs", len(input_files))

        mosaic_bounds = self.calculate_mosaic_bounds(input_files)
        mosaic_width, mosaic_height, mosaic_transform = self.calculate_output_grid(mosaic_bounds)

        # Build source manifest
        source_manifest = []
        for p in input_files:
            try:
                st = os.stat(p)
                source_manifest.append({
                    "filename": os.path.basename(p),
                    "path": os.path.abspath(p),
                    "size_bytes": st.st_size,
                    "mtime": st.st_mtime,
                })
            except Exception:
                pass

        mosaic_memmap_path = os.path.join(self.temp_dir, "mosaic_float32.dat")
        mosaic = np.memmap(
            mosaic_memmap_path,
            mode="w+",
            dtype=np.float32,
            shape=(mosaic_height, mosaic_width),
        )
        mosaic[:] = self.nodata
        mosaic.flush()

        # Atomic temp file output target (.inprogress.tif)
        inprogress_output = output_path + ".inprogress.tif"
        if os.path.exists(inprogress_output):
            try:
                os.remove(inprogress_output)
            except Exception:
                pass

        try:
            total_inputs = len(input_files)
            for idx, file_path in enumerate(input_files):
                self._report_progress(
                    "Mosaicing Raster",
                    idx,
                    total_inputs,
                    f"Reprojecting & merging {idx + 1}/{total_inputs}: {os.path.basename(file_path)}",
                )
                success = self.reproject_and_merge(
                    file_path=file_path,
                    mosaic=mosaic,
                    mosaic_bounds=mosaic_bounds,
                    mosaic_width=mosaic_width,
                    mosaic_height=mosaic_height,
                    mosaic_transform=mosaic_transform,
                )
                if success:
                    self.stats["processed"] += 1
                else:
                    self.stats["failed"] += 1

                # Flush memmap every 5 inputs to balance I/O and memory
                if (idx + 1) % 5 == 0 or (idx + 1) == total_inputs:
                    mosaic.flush()

            valid_pixels, coverage = self.write_mosaic(
                mosaic=mosaic,
                output_path=inprogress_output,
                width=mosaic_width,
                height=mosaic_height,
                output_transform=mosaic_transform,
            )

            # Write metadata
            meta_path = self.write_metadata(
                output_path=output_path,
                bounds=mosaic_bounds,
                width=mosaic_width,
                height=mosaic_height,
                valid_pixels=valid_pixels,
                coverage=coverage,
                source_manifest=source_manifest,
            )

            # Atomic Promotion: rename .inprogress.tif -> final output_path
            final_output = os.path.abspath(output_path)
            if os.path.exists(final_output):
                try:
                    os.remove(final_output)
                except Exception:
                    pass
            os.replace(inprogress_output, final_output)
            logger.info("Mosaic completed and promoted atomically: %s", final_output)
            self._report_progress("Completed", 100, 100, "Mosaic completed successfully")
            return final_output

        finally:
            if not self.keep_temp:
                try:
                    del mosaic
                    gc.collect()
                    shutil.rmtree(self.temp_dir, ignore_errors=True)
                    logger.info("Cleaned temporary mosaic directory: %s", self.temp_dir)
                except Exception as e:
                    logger.warning("Could not clean temp dir %s: %s", self.temp_dir, e)

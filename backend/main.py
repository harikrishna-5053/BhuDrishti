import os
import shutil
import re
import time
from datetime import datetime
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Any

from config import PipelineConfig, ConfigurationError
from precheck_intersection import check_zip_intersection
from zip_manager import extract_zip_safely
from tile_band_discovery import discover_tiles_structured
from ndvi_processing import generate_ndvi
from mosaic_cpu.cpu_periodic_mosaic import create_cpu_periodic_mosaics
from output_manager import get_safe_output_root, get_tile_output_paths
from logger import setup_logger
from utils import is_l2a_product, has_required_bands
from output_writer import save_ndvi_tiff
from processing_tracker import ProcessingTracker, validate_output_tiff

try:
    from osgeo import gdal
except ImportError:
    try:
        import gdal
    except ImportError:
        gdal = None

if gdal and hasattr(gdal, "SetCacheMax"):
    gdal.SetCacheMax(512 * 1024 * 1024)

@dataclass
class PipelineResult:
    total_zip_files: int = 0
    already_processed: int = 0
    processed_zip_files: int = 0
    skipped_outside_india: int = 0
    skipped_unsupported: int = 0
    failed_zip_files: int = 0
    ndvi_outputs_created: int = 0
    mosaic_outputs_created: int = 0
    elapsed_seconds: float = 0.0
    output_files: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    cancelled: bool = False

def get_acquisition_date(zip_path: str) -> datetime:
    name = os.path.basename(zip_path).upper()
    match = re.search(r'(\d{2}[A-Z]{3}\d{4})', name)
    if match:
        try:
            return datetime.strptime(match.group(1), "%d%b%Y")
        except ValueError:
            pass
    return datetime.max

def run_pipeline(
    config: Optional[PipelineConfig] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    log_callback: Optional[Callable[[str, str], None]] = None,
    cancel_event: Optional[Any] = None,
) -> PipelineResult:
    """
    Main reusable Sentinel-2 NDVI processing pipeline.
    Zero side-effects on import. Validates configuration only when invoked.
    """
    start_time = time.perf_counter()

    if config is None:
        config = PipelineConfig.from_env()

    # 1. Validate Configuration at Execution Time
    config.validate()

    # Setup Logging
    log_dir = config.output_root_directory / "logs"
    logger = setup_logger(str(log_dir))

    def emit_log(level: str, msg: str):
        if level == "INFO":
            logger.info(msg)
        elif level == "WARNING":
            logger.warning(msg)
        elif level == "ERROR":
            logger.error(msg)
        if log_callback:
            log_callback(level, msg)

    emit_log("INFO", f"PIPELINE STARTED (Mode: {config.processing_mode.upper()})")

    # Check GPU mode limitation
    if config.processing_mode == "gpu":
        from ndvi_gen import is_gpu_available
        if not is_gpu_available():
            raise ConfigurationError(
                "GPU processing mode requested, but CuPy with CUDA hardware is unavailable on this system. "
                "Please install CUDA drivers & CuPy or switch processing_mode to 'cpu'."
            )
        emit_log("INFO", "GPU processing mode validated and active.")

    output_root_final = config.output_root_directory / "OUTPUT"
    output_root_final.mkdir(parents=True, exist_ok=True)
    extraction_list_file = config.output_root_directory / "extraction_list.txt"

    # Initialize Processing Tracker
    tracker = ProcessingTracker(
        jsonl_log_path=config.processed_files_log,
        legacy_processed_txt=config.output_root_directory / "logs" / "processed_files.txt"
    )

    result = PipelineResult()

    # 2. Scan Input Directory
    zip_files: List[str] = []
    for root, dirs, files in os.walk(config.input_zip_directory):
        # Do not scan generated output folders
        dirs[:] = sorted([d for d in dirs if d not in ("OUTPUT", "logs", "temp")])
        for f in sorted(files):
            if f.lower().endswith(".zip"):
                zip_files.append(os.path.join(root, f))

    zip_files.sort(key=get_acquisition_date)
    result.total_zip_files = len(zip_files)

    print("\n======================================")
    print(f"Total ZIP Files Found : {result.total_zip_files}")
    print("======================================")

    # Write header to extraction list if missing
    if not extraction_list_file.exists():
        with open(extraction_list_file, "w", encoding="utf-8") as f:
            f.write("FILENAME | INTERSECTION_IN_INDIA\n")

    # 3. Main Processing Loop
    for idx, zip_path in enumerate(zip_files):
        # Cancellation Checkpoint 1: Before starting ZIP
        if cancel_event and getattr(cancel_event, "is_set", lambda: False)():
            result.cancelled = True
            emit_log("WARNING", "Pipeline cancelled by user before processing ZIP.")
            break

        zip_name = os.path.basename(zip_path)

        # Check Already Processed (Do NOT record a new JSONL entry; increment summary count)
        if tracker.is_processed(zip_name):
            result.already_processed += 1
            print(f"SKIPPED (ALREADY PROCESSED): {zip_name}")
            emit_log("INFO", f"Skipped already processed: {zip_name}")
            continue

        # Check Previously Skipped Outside India
        if tracker.is_skipped_outside_india(zip_name):
            result.skipped_outside_india += 1
            print(f"SKIPPED (OUTSIDE INDIA - RECORDED): {zip_name}")
            continue

        if progress_callback:
            progress_callback({
                "stage": "zip_scan",
                "current": idx + 1,
                "total": result.total_zip_files,
                "zip_name": zip_name,
                "tile_id": "",
                "message": f"Processing ZIP {idx + 1}/{result.total_zip_files}: {zip_name}"
            })

        print("\n======================================")
        print(f"Processing : {zip_name}")
        print("======================================")

        # Intersection Check
        try:
            intersects = check_zip_intersection(
                zip_path,
                str(config.india_shapefile_path),
                str(extraction_list_file)
            )
        except Exception as e:
            msg = f"Intersection check failed for {zip_name}: {e}"
            emit_log("ERROR", msg)
            tracker.record_status(zip_path, "FAILED", msg)
            result.failed_zip_files += 1
            result.errors.append(msg)
            continue

        if not intersects:
            print("SKIPPED (OUTSIDE INDIA)")
            tracker.record_status(zip_path, "SKIPPED", "Outside India boundary")
            result.skipped_outside_india += 1
            continue

        # Cancellation Checkpoint 2: Before extracting
        if cancel_event and getattr(cancel_event, "is_set", lambda: False)():
            result.cancelled = True
            emit_log("WARNING", "Pipeline cancelled by user before extraction.")
            break

        # Safe Extraction
        extraction_res = extract_zip_safely(
            zip_path,
            target_temp_root=str(config.temporary_directory),
            logger=logger
        )

        if not extraction_res.success or not extraction_res.extraction_directory:
            msg = extraction_res.error_message or f"Extraction failed for {zip_name}"
            emit_log("ERROR", msg)
            tracker.record_status(zip_path, "FAILED", msg)
            result.failed_zip_files += 1
            result.errors.append(msg)
            continue

        extract_dir = extraction_res.extraction_directory
        safe_products = [str(p) for p in extraction_res.safe_roots]

        if not safe_products:
            print("No SAFE products found.")
            tracker.record_status(zip_path, "SKIPPED", "No SAFE product directory found in archive")
            result.skipped_unsupported += 1
            if extract_dir.exists():
                shutil.rmtree(extract_dir, ignore_errors=True)
            continue

        zip_success = True
        outputs_created_for_zip: List[str] = []
        tiles_attempted_count = 0
        tiles_succeeded_count = 0
        tiles_failed_count = 0

        try:
            for safe_path in safe_products:
                safe_name = os.path.basename(safe_path)
                if not is_l2a_product(safe_name):
                    print(f"SKIPPED NON-L2A : {safe_name}")
                    emit_log("INFO", f"Skipped non-L2A product: {safe_name}")
                    continue

                print(f"\nInside SAFE : {safe_name}")
                safe_output_dir = get_safe_output_root(str(output_root_final), zip_path)
                acquisition_id = safe_name.replace(".SAFE", "")

                tiles = discover_tiles_structured(safe_path, logger=logger)
                print(f"Tiles Found : {len(tiles)}")

                for tile_id, band_set in tiles.items():
                    # Cancellation Checkpoint 3: Before processing tile
                    if cancel_event and getattr(cancel_event, "is_set", lambda: False)():
                        result.cancelled = True
                        emit_log("WARNING", f"Pipeline cancelled before tile {tile_id}.")
                        break

                    tiles_attempted_count += 1

                    if progress_callback:
                        progress_callback({
                            "stage": "ndvi_generation",
                            "current": tiles_attempted_count,
                            "total": len(tiles),
                            "zip_name": zip_name,
                            "tile_id": tile_id,
                            "message": f"Generating NDVI for tile {tile_id}"
                        })

                    red = band_set.b04_path
                    nir = band_set.b08_path
                    scl = band_set.scl_path

                    red_ds = gdal.Open(red)
                    scl_ds = gdal.Open(scl)
                    if not red_ds or not scl_ds:
                        print(f"SKIPPED TILE (GDAL OPEN FAILED): {tile_id}")
                        tiles_failed_count += 1
                        zip_success = False
                        continue

                    scl_resampled = gdal.Warp(
                        "",
                        scl_ds,
                        format="MEM",
                        width=red_ds.RasterXSize,
                        height=red_ds.RasterYSize,
                        resampleAlg="near"
                    )

                    try:
                        ndvi, ref_ds = generate_ndvi(red, nir, scl_resampled, logger)
                        tif_path, _ = get_tile_output_paths(safe_output_dir, acquisition_id, tile_id)

                        valid_ndvi = ndvi[ndvi != config.nodata_value]
                        if valid_ndvi.size == 0:
                            print(f"No valid NDVI pixels for tile {tile_id}")
                            tiles_failed_count += 1
                            zip_success = False
                            continue

                        # Save output GeoTIFF
                        save_ndvi_tiff(ndvi, ref_ds, tif_path, logger)

                        # Validate output GeoTIFF before declaring success
                        val_ok, val_err = validate_output_tiff(tif_path, expected_nodata=config.nodata_value)
                        if not val_ok:
                            print(f"TILE OUTPUT VALIDATION FAILED : {tile_id} | {val_err}")
                            emit_log("ERROR", f"Output validation failed for tile {tile_id}: {val_err}")
                            tiles_failed_count += 1
                            zip_success = False
                            continue

                        tiles_succeeded_count += 1
                        outputs_created_for_zip.append(tif_path)
                        result.output_files.append(tif_path)
                        result.ndvi_outputs_created += 1

                    except Exception as e:
                        zip_success = False
                        tiles_failed_count += 1
                        msg = f"Tile processing failed: {tile_id} | {e}"
                        print(f"TILE FAILED : {tile_id}\n{e}")
                        emit_log("ERROR", msg)
                        result.errors.append(msg)

            # Record final ZIP processing status
            if zip_success and outputs_created_for_zip:
                tracker.record_status(
                    zip_path=zip_path,
                    status="PROCESSED",
                    reason="NDVI outputs created and validated successfully",
                    products_found=len(safe_products),
                    tiles_attempted=tiles_attempted_count,
                    tiles_succeeded=tiles_succeeded_count,
                    tiles_failed=tiles_failed_count,
                    outputs_created=outputs_created_for_zip
                )
                result.processed_zip_files += 1
                emit_log("INFO", f"Completed processing: {zip_name}")
            else:
                tracker.record_status(
                    zip_path=zip_path,
                    status="FAILED",
                    reason=f"Processing incomplete or failed. Succeeded tiles: {tiles_succeeded_count}/{tiles_attempted_count}",
                    products_found=len(safe_products),
                    tiles_attempted=tiles_attempted_count,
                    tiles_succeeded=tiles_succeeded_count,
                    tiles_failed=tiles_failed_count,
                    outputs_created=outputs_created_for_zip
                )
                result.failed_zip_files += 1
                emit_log("WARNING", f"Failed or incomplete processing: {zip_name}")

        finally:
            if extract_dir and extract_dir.exists():
                shutil.rmtree(extract_dir, ignore_errors=True)

    # Cancellation Checkpoint 4: Before mosaicing
    if not (cancel_event and getattr(cancel_event, "is_set", lambda: False)()):
        if config.create_periodic_mosaic:
            print("\nGenerating CPU Periodic NDVI Mosaics...")
            if progress_callback:
                progress_callback({
                    "stage": "mosaic",
                    "current": 1,
                    "total": 1,
                    "zip_name": "",
                    "tile_id": "",
                    "message": "Generating CPU Periodic NDVI Mosaics"
                })
            try:
                created_mosaics = create_cpu_periodic_mosaics(str(output_root_final))
                if created_mosaics:
                    result.mosaic_outputs_created += len(created_mosaics)
                    result.output_files.extend(created_mosaics)
                    print(f"\nCPU Periodic Mosaics Created Successfully: {len(created_mosaics)} mosaic file(s)")
                    emit_log("INFO", f"CPU Periodic Mosaics Created Successfully: {len(created_mosaics)} mosaic file(s)")
                else:
                    print("\nNo periodic mosaics created.")
            except Exception as e:
                msg = f"CPU Periodic Mosaic Failed: {e}"
                print("CPU Periodic Mosaic Failed")
                print(e)
                emit_log("ERROR", msg)
                result.errors.append(msg)

    result.elapsed_seconds = round(time.perf_counter() - start_time, 2)

    print("\n===================================")
    print("PIPELINE EXECUTION SUMMARY")
    print(f"Total ZIP Files Scanned    : {result.total_zip_files}")
    print(f"Already Processed          : {result.already_processed}")
    print(f"Processed Successfully     : {result.processed_zip_files}")
    print(f"Skipped (Outside India)    : {result.skipped_outside_india}")
    print(f"Skipped (Unsupported)      : {result.skipped_unsupported}")
    print(f"Failed ZIP Files           : {result.failed_zip_files}")
    print(f"NDVI Outputs Created       : {result.ndvi_outputs_created}")
    print(f"Mosaic Outputs Created     : {result.mosaic_outputs_created}")
    print(f"Elapsed Time               : {result.elapsed_seconds} seconds")
    print("===================================")

    return result

if __name__ == "__main__":
    # Command-line entrypoint
    try:
        cfg = PipelineConfig.from_args()
        run_pipeline(cfg)
    except ConfigurationError as err:
        print(f"\n[CONFIGURATION ERROR] {err}")
        exit(1)
    except Exception as err:
        print(f"\n[PIPELINE FATAL ERROR] {err}")
        exit(1)
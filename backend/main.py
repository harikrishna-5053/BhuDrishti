import os
import shutil
import re
from datetime import datetime
from precheck_intersection import check_zip_intersection
from zip_manager import extract_zip_if_valid
from tile_band_discovery import discover_tiles 

#from ndvi_gen import generate_ndvi #####----CUDA PROCESSING
from ndvi_processing import generate_ndvi  ######## CPU PROCESSING

#from gpu_periodic_mosaic import create_gpu_periodic_mosaics

#from mosaic_gpu.gpu_periodic_mosaic import create_periodic_gpu_mosaics
#from mosaic_gpu.final_india_mosaic import create_india_mosaic

from mosaic_cpu.cpu_periodic_mosaic import create_cpu_periodic_mosaics

from output_manager import (
    get_safe_output_root,
    get_tile_output_paths
)
from logger import setup_logger
from utils import (
    is_l2a_product,
    has_required_bands
)
from output_writer import save_ndvi_tiff


import time
start = time.perf_counter()
# ==========================================================
# CONFIGURATION
# ==========================================================

ZIP_DIR = "/home/student/Desktop/NRSC/Batch_SENTINEL/All_Zips"
#"/ots/APA/ESA/SEN2C/MSI/2026/MAY"

OUTPUT_ROOT = "/home/student/Desktop/NRSC/Batch_SENTINEL/All_Zips"
#"home/gpdd/Sentinel2_NDVI/Ousstput/"
OUTPUT_ROOT_FINAL = os.path.join(OUTPUT_ROOT, "OUTPUT")

INDIA_SHP = "/home/student/Desktop/NRSC/IndiaShapeFile/STATE_BDY_FIXED.shp"
#"home/gpdd/Sentinel2_NDVI/"

LOG_DIR = os.path.join(OUTPUT_ROOT, "logs")
EXTRACTION_LIST = os.path.join(OUTPUT_ROOT, "extraction_list.txt")
PROCESSED_LIST = os.path.join(LOG_DIR, "processed_files.txt")

# ==========================================================
# LOGGER
# ==========================================================

logger = setup_logger(LOG_DIR)
logger.info("PIPELINE STARTED")


# ==========================================================
# LOAD PROCESSED ZIP LIST
# ==========================================================

if os.path.exists(PROCESSED_LIST):

    with open(PROCESSED_LIST, "r") as f:
        processed_zips = set(
            line.strip() for line in f if line.strip()
        )

else:

    processed_zips = set()

os.makedirs(OUTPUT_ROOT_FINAL, exist_ok=True)

# ==========================================================
# GET ACQUISITION DATE FROM ZIP NAME
# ==========================================================

def get_acquisition_date(zip_path):

    name = os.path.basename(zip_path).upper()

    match = re.search(r'(\d{2}[A-Z]{3}\d{4})', name)

    if match:
        return datetime.strptime(match.group(1), "%d%b%Y")

    return datetime.max

# ==========================================================
# COLLECT ALL ZIP FILES
# ==========================================================

zip_files = []

for root, dirs, files in os.walk(ZIP_DIR):

    # ------------------------------------------------------
    # Do NOT scan generated folders
    # ------------------------------------------------------
    dirs[:] = sorted(
        d for d in dirs
        if d not in ("OUTPUT", "logs")
    )

    print(f"Scanning: {root}")

    for f in sorted(files):

        if f.endswith(".zip") and "_STUBBAOJD_" in f:

            full_path = os.path.join(root, f)

            zip_files.append(full_path)

# ----------------------------------------------------------
# Sort ZIPs by acquisition date
# ----------------------------------------------------------

zip_files.sort(key=get_acquisition_date)

print("\n======================================")
print(f"Total ZIP Files Found : {len(zip_files)}")
print("======================================")

print("\nZIP Processing Order:\n")

for zip_file in zip_files:
    print("FOUND ZIP :", zip_file)

print()

# ==========================================================
# CREATE EXTRACTION LIST
# ==========================================================

with open(EXTRACTION_LIST, "w") as f:
    f.write("FILENAME | INTERSECTION_IN_INDIA\n")

# ==========================================================
# MAIN PROCESSING LOOP
# ==========================================================

for zip_path in zip_files:

    extract_dir = None

    try:

        zip_name = os.path.basename(zip_path)

        # ------------------------------------------------------
        # SKIP ALREADY PROCESSED ZIP
        # ------------------------------------------------------

        if zip_name in processed_zips:

            print(f"SKIPPED (ALREADY PROCESSED): {zip_name}")
            logger.info(f"Skipped already processed: {zip_name}")
            continue

        print("\n======================================")
        print(f"Processing : {zip_name}")
        print("======================================")

        # ------------------------------------------------------
        # INDIA INTERSECTION CHECK
        # ------------------------------------------------------

        intersects = check_zip_intersection(
            zip_path,
            INDIA_SHP,
            EXTRACTION_LIST
        )

        if not intersects:

            print("SKIPPED (OUTSIDE INDIA)")
            continue

        # ------------------------------------------------------
        # EXTRACT ZIP
        # ------------------------------------------------------

        extract_dir, safe_products = extract_zip_if_valid(
            zip_path,
            intersects,
            logger
        )

        if not safe_products:

            print("No SAFE products found.")
            continue
        zip_success = True

        # ------------------------------------------------------
        # PROCESS EACH SAFE PRODUCT
        # ------------------------------------------------------

        for safe_path in safe_products:

            safe_name = os.path.basename(safe_path)

            if not is_l2a_product(safe_name):

                print(f"SKIPPED NON-L2A : {safe_name}")
                continue

            print(f"\nInside SAFE : {safe_name}")

            safe_output_dir = get_safe_output_root(
                OUTPUT_ROOT_FINAL,
                zip_path
            )

            acquisition_id = safe_name.replace(".SAFE", "")

            tiles = discover_tiles(safe_path, logger)

            print(f"Tiles Found : {len(tiles)}")

            # --------------------------------------------------
            # PROCESS EACH TILE
            # --------------------------------------------------

            for tile_id, band_info in tiles.items():

                if not has_required_bands(band_info):

                    zip_success = False

                    print(f"SKIPPED TILE (MISSING BANDS): {tile_id}")
                    logger.warning(f"Missing bands: {tile_id}")

                    continue

                red = band_info["red"]
                nir = band_info["nir"]
                scl = band_info["scl"]

                from osgeo import gdal

                red_ds = gdal.Open(red)
                scl_ds = gdal.Open(scl)

                scl_resampled = gdal.Warp(
                    "",
                    scl_ds,
                    format="MEM",
                    width=red_ds.RasterXSize,
                    height=red_ds.RasterYSize,
                    resampleAlg="near"
                )

                try:
                    start_time = datetime.now()
                    print('NDVI Generation invoking......'+str(start_time))
                    ndvi, ref_ds = generate_ndvi(
                        red,
                        nir,
                        scl_resampled,
                        logger
                    )
                    end_time= datetime.now()
                    print('NDVI Generation completion......'+str(end_time))

                    tif_path, _ = get_tile_output_paths(
                        safe_output_dir,
                        acquisition_id,
                        tile_id
                    )

                    valid_ndvi = ndvi[ndvi != -9999]

                    if valid_ndvi.size == 0:

                        print(f"No valid NDVI pixels for tile {tile_id}")
                        continue

                    print("\nNDVI Statistics")
                    print("Minimum :", valid_ndvi.min())
                    print("Maximum :", valid_ndvi.max())

                    save_ndvi_tiff(
                        ndvi,
                        ref_ds,
                        tif_path,
                        logger
                    )

                    '''save_ndvi_png(
                        ndvi,
                        png_path,
                        tile_id,
                        logger
                    )'''

                except Exception as e:

                    zip_success = False

                    print(f"TILE FAILED : {tile_id}")
                    print(e)
                    logger.exception(f"Tile failed: {tile_id}")
        # ------------------------------------------------------
        # MARK ZIP AS SUCCESSFULLY PROCESSED
        # ------------------------------------------------------

        if zip_success:

            with open(PROCESSED_LIST, "a") as f:
                f.write(zip_name + "\n")

            processed_zips.add(zip_name)

            logger.info(f"Completed: {zip_name}")
        else:

            logger.warning(f"Incomplete processing: {zip_name}")

    except Exception as e:

        print(f"\nFAILED ZIP : {os.path.basename(zip_path)}")
        print(e)
        logger.exception(f"Failed processing ZIP: {zip_path}")

    finally:

        if extract_dir and os.path.exists(extract_dir):

            print("\nRemoving extracted folder...")

            shutil.rmtree(extract_dir)

# ==========================================================
# CREATE CPU PERIODIC NDVI MOSAICS
# ==========================================================

print("\nGenerating CPU Periodic NDVI Mosaics...")

try:

    create_cpu_periodic_mosaics(
        OUTPUT_ROOT_FINAL
    )

    print(
        "\nCPU Periodic Mosaics Created Successfully"
    )

except Exception as e:

    print(
        "CPU Periodic Mosaic Failed"
    )

    print(e)

    logger.exception(
        "CPU Periodic Mosaic Failed"
    )


end = time.perf_counter()

print("\n===================================")
print("TOTAL EXECUTION TIME")
print(f"{end-start:.2f} seconds")
print("===================================")

'''
# ==========================================================
# CREATE GPU UTM ZONE PERIODIC MOSAICS
# ==========================================================


print("\nGenerating GPU Periodic NDVI Mosaics...")


try:


    create_periodic_gpu_mosaics(

        OUTPUT_ROOT_FINAL

    )


    print(
        "\nGPU Zone Mosaics Completed"
    )


except Exception as e:


    print(
        "GPU Mosaic Failed"
    )


    print(e)


    logger.exception(
        "GPU Mosaic Failed"
    )
'''
import os
import re
import calendar
from collections import defaultdict
from datetime import datetime

from osgeo import gdal
import numpy as np
import cupy as cp

gdal.UseExceptions()

def create_10day_mosaic(tif_list, output_file):

    print("\nStarting GDAL Mosaic")

    print("Input Tiles:")
    for tif in tif_list:
        print(tif)


    print("\nCreating final mosaic...")


    gdal.Warp(
        output_file,
        tif_list,

        format="GTiff",

        # Common CRS
        dstSRS="EPSG:4326",

        srcNodata=-9999,
        dstNodata=-9999,

        # interpolation
        resampleAlg="bilinear",

        multithread=True,

        warpOptions=[
            "NUM_THREADS=ALL_CPUS"
        ],

        creationOptions=[
            "COMPRESS=LZW",
            "TILED=YES",
            "BIGTIFF=YES"
        ]
    )


    print("\nMosaic Created Successfully")
    print(output_file)
    
def create_gpu_periodic_mosaics(output_root):
    groups = defaultdict(list)
    # ==========================================================
    # FIND ALL NDVI TIFF FILES
    # ==========================================================

    for root, dirs, files in os.walk(output_root):

        for file in files:

            if not file.endswith("_NDVI.tif"):
                continue

            match = re.search(r"(\d{8})T", file)

            if match is None:
                continue

            date = datetime.strptime(
                match.group(1),
                "%Y%m%d"
            )

            year = date.year
            month = date.month
            day = date.day

            if day <= 10:

                interval = "01_10"

            elif day <= 20:

                interval = "11_20"

            else:

                last_day = calendar.monthrange(
                    year,
                    month
                )[1]

                interval = f"21_{last_day}"

            key = (year, month, interval)

            groups[key].append(
                os.path.join(root, file)
            )

    # ==========================================================
    # OUTPUT DIRECTORY
    # ==========================================================

    mosaic_root = os.path.join(
        output_root,
        "TEMP_MOSAIC"
    )

    os.makedirs(
        mosaic_root,
        exist_ok=True
    )

    # ==========================================================
    # CREATE GPU MOSAICS
    # ==========================================================

    for (year, month, interval), tif_list in sorted(groups.items()):

        month_name = calendar.month_name[month].upper()

        save_folder = os.path.join(
            mosaic_root,
            str(year),
            month_name
        )

        os.makedirs(
            save_folder,
            exist_ok=True
        )

        output_file = os.path.join(
            save_folder,
            f"{interval}_{month_name}_{year}_NDVI_MOSAIC.tif"
        )

        print("\n=======================================")
        print("GPU PERIODIC MOSAIC")
        print("=======================================")
        print(f"Period      : {interval}")
        print(f"Tiles       : {len(tif_list)}")
        print(f"Output File : {output_file}")

        try:

            create_10day_mosaic(
                tif_list,
                output_file
            )

            print("Status      : SUCCESS")

        except Exception as e:

            print("Status      : FAILED")
            print(e)

    print("\n=======================================")
    print("ALL GPU PERIODIC MOSAICS COMPLETED")
    print("=======================================")
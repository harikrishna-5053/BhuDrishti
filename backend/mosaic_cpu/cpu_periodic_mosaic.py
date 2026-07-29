import os
import re
from datetime import datetime

from mosaic_cpu.mosaic_cpu import MosaicCPU

from osgeo import gdal
gdal.SetCacheMax(4096)


def get_date_from_filename(filename):

    filename = os.path.basename(filename)

    # Prefer the first datetime because it represents
    # the Sentinel acquisition/sensing time.
    match = re.search(
        r"_(\d{8})T\d{6}_",
        filename
    )

    if match is None:
        print(
            f"Unable to extract date from filename: {filename}"
        )
        return None

    date_text = match.group(1)

    try:
        return datetime.strptime(
            date_text,
            "%Y%m%d"
        )

    except ValueError:
        print(
            f"Invalid date found in filename: {filename}"
        )
        return None


def get_period(date):
    """
    Return the ten-day period for a given date.
    """

    day = date.day

    if day <= 10:
        return "01_10"

    if day <= 20:
        return "11_20"

    return "21_31"


def collect_ndvi_files(output_root):
    """
    Find all source NDVI TIFF files inside output_root.
    """

    files = []

    if not os.path.isdir(output_root):
        print(
            f"NDVI output directory does not exist: {output_root}"
        )
        return files

    for root, dirs, filenames in os.walk(output_root):

        # Do not scan previously generated mosaic folders
        dirs[:] = [
            directory
            for directory in dirs
            if directory.upper() != "MOSAIC"
        ]

        for filename in filenames:

            filename_lower = filename.lower()

            if not filename_lower.endswith(".tif"):
                continue

            if "_ndvi" not in filename_lower:
                continue

            if "mosaic" in filename_lower:
                continue

            files.append(
                os.path.join(
                    root,
                    filename
                )
            )

    return files

def create_cpu_periodic_mosaics(output_root):

    print(
        "\nScanning NDVI files for CPU mosaic..."
    )

    ndvi_files = collect_ndvi_files(
        output_root
    )

    if not ndvi_files:
        print("No NDVI files found")
        return

    print(
        f"Total NDVI files found: {len(ndvi_files)}"
    )

    # Important:
    # Group by year and month also, not only by period.
    #
    # Otherwise files from May, June, July, etc. having
    # the same period could be placed in one mosaic.
    groups = {}

    for file_path in ndvi_files:

        date = get_date_from_filename(
            os.path.basename(file_path)
        )

        if date is None:
            print(
                f"Date not found: {file_path}"
            )
            continue

        period = get_period(date)

        group_key = (
            date.year,
            date.month,
            period
        )

        groups.setdefault(
            group_key,
            []
        ).append(file_path)

        print(
            f"Detected: {os.path.basename(file_path)}"
        )
        print(
            f"Date    : {date.strftime('%Y-%m-%d')}"
        )
        print(
            f"Period  : {period}"
        )

    if not groups:
        print(
            "No valid NDVI files could be grouped"
        )
        return

    mosaic_root = os.path.join(
        output_root,
        "MOSAIC"
    )

    os.makedirs(
        mosaic_root,
        exist_ok=True
    )

    for group_key in sorted(groups):

        year, month_number, period = group_key

        files = sorted(
            groups[group_key]
        )

        month_name = datetime(
            year,
            month_number,
            1
        ).strftime("%B").upper()

        print(
            "\n======================================"
        )
        print(
            f"Creating CPU mosaic: "
            f"{period} {month_name} {year}"
        )
        print(
            f"Input files: {len(files)}"
        )
        print(
            "======================================"
        )

        for index, file_path in enumerate(
            files,
            start=1
        ):
            print(
                f"{index}. {file_path}"
            )

        output_dir = os.path.join(
            mosaic_root,
            str(year),
            month_name,
            period
        )

        os.makedirs(
            output_dir,
            exist_ok=True
        )

        output_file = os.path.join(
            output_dir,
            (
                f"{period}_{month_name}_{year}"
                f"_NDVI_CPU_MOSAIC.tif"
            )
        )

        mosaic = MosaicCPU()

        mosaic.add_files(
            files
        )

        mosaic.set_output(
            output_file
        )

        mosaic.create_mosaic()

        print(
            "\nCPU mosaic created successfully:"
        )
        print(
            output_file
        )


if __name__ == "__main__":

    create_cpu_periodic_mosaics(
        "/home/student/Desktop/NRSC/"
        "Batch_SENTINEL/All_Zips"
    )
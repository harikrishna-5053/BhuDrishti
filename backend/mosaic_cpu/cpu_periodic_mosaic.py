import os
import re
from processing_tracker import validate_output_tiff
from datetime import datetime

from mosaic_cpu.mosaic_cpu import MosaicCPU

try:
    from osgeo import gdal
except ImportError:
    try:
        import gdal
    except ImportError:
        gdal = None
if gdal and hasattr(gdal, "SetCacheMax"):
    gdal.SetCacheMax(4096)


def get_date_from_filename(filename):
    filename = os.path.basename(filename)

    # 1. Prefer Sentinel-2 acquisition/sensing timestamp: _YYYYMMDDTHHMMSS_
    match = re.search(r"_(\d{8})T\d{6}_", filename)
    if match:
        try:
            return datetime.strptime(match.group(1), "%Y%m%d")
        except ValueError:
            pass

    # 2. Match DDMMMYYYY format (e.g. 18MAR2026)
    match = re.search(r"(\d{2})([A-Z]{3})(\d{4})", filename.upper())
    if match:
        try:
            day, month_str, year = match.groups()
            return datetime.strptime(f"{day}{month_str}{year}", "%d%b%Y")
        except ValueError:
            pass

    # 3. Fallback to any 8-digit date string YYYYMMDD
    match = re.search(r"(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])", filename)
    if match:
        try:
            return datetime.strptime(match.group(0), "%Y%m%d")
        except ValueError:
            pass

    return None


def get_period(date):
    """
    Return the ten-day period for a given date (01_10, 11_20, 21_END).
    """
    day = date.day
    if day <= 10:
        return "01_10"
    elif day <= 20:
        return "11_20"
    else:
        return "21_END"


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

    ndvi_files = []

    for root, dirs, files in os.walk(output_root):

        if "MOSAIC" in root.split(os.sep):
            continue

        for file in files:
            if file.endswith(".tif") or file.endswith(".tiff"):
                ndvi_files.append(
                    os.path.join(root, file)
                )

    return ndvi_files


def create_cpu_periodic_mosaics(output_root) -> list[str]:

    print(
        "\nScanning NDVI files for CPU mosaic..."
    )

    created_mosaic_files: list[str] = []

    ndvi_files = collect_ndvi_files(
        output_root
    )

    if not ndvi_files:
        print("No NDVI files found")
        return []

    print(
        f"Total NDVI files found: {len(ndvi_files)}"
    )

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

    if not groups:
        print(
            "No valid NDVI files could be grouped"
        )
        return []

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

        val_ok, val_err = validate_output_tiff(output_file)
        if val_ok:
            created_mosaic_files.append(output_file)
            print(
                f"\nCPU mosaic created and validated successfully: {output_file}"
            )
        else:
            print(
                f"\nMosaic validation failed for {output_file}: {val_err}"
            )

    return created_mosaic_files


if __name__ == "__main__":

    create_cpu_periodic_mosaics(
        "/home/student/Desktop/NRSC/"
        "Batch_SENTINEL/All_Zips"
    )
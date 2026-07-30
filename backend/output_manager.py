import os
from datetime import datetime


# ==========================================================
# SAFE OUTPUT ROOT (MIRROR STRUCTURE)
# ==========================================================

def get_safe_output_root(output_root, zip_name):

    name = os.path.basename(zip_name)

    try:

        raw = name.split("_")[3]          # 31MAY2026

        dt = datetime.strptime(raw, "%d%b%Y")

        year = dt.strftime("%Y")

        month = dt.strftime("%B").upper()     # MAY, JUNE...

    except:

        year = "UNKNOWN_YEAR"

        month = "UNKNOWN_MONTH"

    folder_name = os.path.splitext(name)[0]

    output_dir = os.path.join(

        output_root,

        year,

        month,

        folder_name

    )

    os.makedirs(output_dir, exist_ok=True)

    return output_dir


# ==========================================================
# TILE OUTPUT PATHS (DATE + TILE CLEAN NAMING)
# ==========================================================

def get_tile_output_paths(safe_output_dir, acquisition_id, tile_id):

    date_str = "UNKNOWN_DATE"

    try:
        raw = acquisition_id.split("_")[2]  # 20260531T....
        dt = datetime.strptime(raw[:8], "%Y%m%d")
        date_str = dt.strftime("%d_%b_%Y")
    except:
        pass

    tif_path = os.path.join(
        safe_output_dir,
        f"{acquisition_id}_{tile_id}_NDVI.tif"
    )

    png_path = os.path.join(
        safe_output_dir,
        f"{acquisition_id}_{tile_id}_NDVI.png"
    )

    return tif_path, png_path

    
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

def find_existing_output(
    output_root: str,
    satellite: str = "ALL",
    processing_type: str = "daywise",
    target_date: str = None,
    year: int = None,
    month: int = None,
    composite_period: str = None,
) -> str:
    """
    Scans the output directory tree to find an existing valid NDVI GeoTIFF
    matching the satellite, processing type, and target date or period.
    """
    if not os.path.exists(output_root):
        return None

    sat_clean = (satellite or "ALL").upper().replace("-", "")

    for root, _, files in os.walk(output_root):
        for f in files:
            if not f.lower().endswith((".tif", ".tiff")):
                continue
            if f.endswith(".inprogress.tif"):
                continue

            f_upper = f.upper()
            
            # Satellite filtering if specified
            if sat_clean != "ALL" and sat_clean not in f_upper:
                # Check companion metadata JSON if available
                meta_path = os.path.splitext(os.path.join(root, f))[0] + "_metadata.json"
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, "r", encoding="utf-8") as mf:
                            mdata = json.load(mf)
                            sat_in_meta = mdata.get("satellite", "").upper().replace("-", "")
                            if sat_clean not in sat_in_meta:
                                continue
                    except Exception:
                        continue
                else:
                    continue

            if processing_type == "daywise" and target_date:
                # Match YYYY-MM-DD or YYYYMMDD in filename/path
                date_clean = target_date.replace("-", "")
                if date_clean in f_upper.replace("-", "") or target_date in root:
                    return os.path.join(root, f)

            elif processing_type == "composite" and composite_period:
                period_clean = composite_period.upper()
                if period_clean in f_upper or "MOSAIC" in f_upper:
                    if year and str(year) not in f_upper and str(year) not in root:
                        continue
                    return os.path.join(root, f)

    return None


    
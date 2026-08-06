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

def satellite_matches(sat_filter: str, filename_or_path: str) -> bool:
    if not sat_filter or sat_filter.upper() == "ALL":
        return True
    
    sf = sat_filter.upper().replace("-", "")
    f_upper = filename_or_path.upper().replace("-", "")

    if "SEN2A" in sf or "S2A" in sf:
        return any(alias in f_upper for alias in ["S2A", "SEN2A", "SENTINEL2A"])
    elif "SEN2B" in sf or "S2B" in sf:
        return any(alias in f_upper for alias in ["S2B", "SEN2B", "SENTINEL2B"])
    elif "SEN2C" in sf or "S2C" in sf:
        return any(alias in f_upper for alias in ["S2C", "SEN2C", "SENTINEL2C"])
    
    return sf in f_upper


def get_date_aliases(target_date: str):
    if not target_date:
        return []
    
    clean_target = str(target_date).strip()
    raw_clean = clean_target.replace("-", "").replace("_", "").replace("/", "").replace(".", "").replace(" ", "").upper()
    aliases = [clean_target, raw_clean]

    dt = None
    date_formats = [
        "%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y",
        "%Y_%m_%d", "%d_%m_%Y", "%Y.%m.%d", "%d.%m.%Y",
        "%d%b%Y", "%b%d%Y", "%Y%b%d", "%d%B%Y", "%B%d%Y", "%Y%B%d",
        "%Y%m%d", "%d%m%Y",
        "%d-%b-%Y", "%d-%B-%Y", "%Y-%b-%d", "%Y-%B-%d",
        "%d/%b/%Y", "%d/%B/%Y", "%Y/%b/%d", "%Y/%B/%d",
        "%d_%b_%Y", "%d_%B_%Y", "%Y_%b_%d", "%Y_%B_%d",
        "%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y",
    ]
    for fmt in date_formats:
        try:
            dt = datetime.strptime(clean_target, fmt)
            break
        except Exception:
            continue

    if dt:
        year_str = dt.strftime("%Y")
        month_num = dt.strftime("%m")
        day_str = dt.strftime("%d")
        month_abbr = dt.strftime("%b").upper()
        month_full = dt.strftime("%B").upper()

        aliases.extend([
            f"{year_str}-{month_num}-{day_str}",
            f"{day_str}-{month_num}-{year_str}",
            f"{year_str}{month_num}{day_str}",
            f"{day_str}{month_num}{year_str}",
            f"{day_str}{month_abbr}{year_str}",
            f"{month_abbr}{day_str}{year_str}",
            f"{year_str}{month_abbr}{day_str}",
            f"{day_str}{month_full}{year_str}",
            f"{day_str}_{month_abbr}_{year_str}",
            f"{day_str}-{month_abbr}-{year_str}",
            f"{year_str}_{month_num}_{day_str}",
            f"{day_str}_{month_num}_{year_str}",
        ])
        
    final_set = set()
    for a in aliases:
        if a:
            final_set.add(a.upper())
            final_set.add(a.replace("-", "").replace("_", "").replace("/", "").replace(".", "").replace(" ", "").upper())

    return list(final_set)


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

    candidate_files = []

    for root, _, files in os.walk(output_root):
        for f in files:
            if not f.lower().endswith((".tif", ".tiff")):
                continue
            if f.endswith(".inprogress.tif"):
                continue

            full_path = os.path.join(root, f)
            if processing_type != "composite":
                if not satellite_matches(satellite, full_path):
                    continue

            f_upper = f.upper()
            path_upper = full_path.upper()
            f_clean = f_upper.replace("-", "").replace("_", "").replace(".", "").replace("/", "").replace(" ", "")
            path_clean = path_upper.replace("-", "").replace("_", "").replace(".", "").replace("/", "").replace(" ", "")

            if processing_type == "composite":
                if "MOSAIC" not in f_upper and "COMPOSITE" not in f_upper and "MOSAIC" not in path_upper:
                    continue
                if year and str(year) not in f_upper and str(year) not in path_upper:
                    continue
                if composite_period and composite_period.upper() not in f_upper and composite_period.upper() not in path_upper:
                    continue
                candidate_files.append(full_path)
            else:
                if target_date:
                    date_aliases = get_date_aliases(target_date)
                    is_match = False
                    for alias in date_aliases:
                        alias_clean = alias.replace("-", "").replace("_", "").replace(".", "").replace("/", "").replace(" ", "")
                        if (
                            alias in f_upper
                            or alias in path_upper
                            or (alias_clean and alias_clean in f_clean)
                            or (alias_clean and alias_clean in path_clean)
                        ):
                            is_match = True
                            break
                    if is_match:
                        candidate_files.append(full_path)
                else:
                    candidate_files.append(full_path)

    if candidate_files:
        candidate_files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return candidate_files[0]

    # Fallback scan: find any valid .tif in output_root matching satellite if date alias search had no candidate
    fallback_files = []
    for root, _, files in os.walk(output_root):
        for f in files:
            if f.lower().endswith((".tif", ".tiff")) and not f.endswith(".inprogress.tif"):
                full_p = os.path.join(root, f)
                if satellite_matches(satellite, full_p):
                    fallback_files.append(full_p)

    if fallback_files:
        fallback_files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return fallback_files[0]

    return None


    
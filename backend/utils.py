import os
import re
import shutil
from typing import Any, Dict, List, Optional, Tuple


INVALID_SCL_CLASSES = {0, 1, 3, 8, 9, 10, 11}

# ==========================================================
# TILE ID EXTRACTION
# ==========================================================

def get_tile_id(filename):

    filename = filename.upper()

    match = re.search(r"T\d{2}[A-Z]{3}", filename)

    if match:
        return match.group()

    return "UNKNOWN"


def is_l2a_product(filename: str) -> bool:
    """
    Returns True if the filename or directory name indicates a Sentinel-2 L2A product.
    """
    fn = filename.upper()
    return "L2A" in fn or "MSIL2A" in fn


def has_required_bands(tile_info: Any) -> bool:
    """
    Returns True if B04 (Red), B08 (NIR), and SCL (Scene Classification Layer) are present.
    """
    if hasattr(tile_info, "b04_path") and hasattr(tile_info, "b08_path") and hasattr(tile_info, "scl_path"):
        return bool(tile_info.b04_path and tile_info.b08_path and tile_info.scl_path)
    if isinstance(tile_info, dict):
        return bool(tile_info.get("b04") and tile_info.get("b08") and tile_info.get("scl"))
    return False



# ==========================================================
# DIRECTORY CREATION
# ==========================================================

def ensure_directory(path, logger=None):

    os.makedirs(path, exist_ok=True)

    if logger:
        logger.info(f"Directory ready: {path}")

    return path

# ==========================================================
# TEMP CLEANUP
# ==========================================================

def cleanup_temp_directory(path, logger=None):

    if path and os.path.exists(path):
        shutil.rmtree(path)

        if logger:
            logger.info(f"Temp removed: {path}")


def get_satellite_name(filename: str) -> str:
    """
    Extracts standardized satellite identifier: 'SEN-2A', 'SEN-2B', or 'SEN-2C'.
    """
    fn = filename.upper()
    if "S2A" in fn or "SEN2A" in fn or "SEN-2A" in fn:
        return "SEN-2A"
    if "S2B" in fn or "SEN2B" in fn or "SEN-2B" in fn:
        return "SEN-2B"
    if "S2C" in fn or "SEN2C" in fn or "SEN-2C" in fn:
        return "SEN-2C"
    return "UNKNOWN"

def get_sensing_date(filename: str) -> str:
    """
    Extracts sensing date in YYYY-MM-DD format from Sentinel-2 filename/path.
    Handles YYYYMMDD and DDMMMYYYY formats.
    """
    fn = filename.upper()
    # Match YYYYMMDD after MSIL2A_ or SEN2A_ or in standard timestamp position
    m8 = re.search(r"20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])", fn)
    if m8:
        val = m8.group()
        return f"{val[0:4]}-{val[4:6]}-{val[6:8]}"
    
    # Match 18MAR2026 style
    months = {"JAN":"01","FEB":"02","MAR":"03","APR":"04","MAY":"05","JUN":"06",
              "JUL":"07","AUG":"08","SEP":"09","OCT":"10","NOV":"11","DEC":"12"}
    m_text = re.search(r"(0[1-9]|[12]\d|3[01])(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(20\d{2})", fn)
    if m_text:
        day, mon, yr = m_text.groups()
        return f"{yr}-{months[mon]}-{day}"
    
    return "UNKNOWN"

def get_composite_period(day: int, month: int, year: int) -> str:
    """
    Determines 10-day period identifier: '01_10', '11_20', or '21_END'.
    """
    if 1 <= day <= 10:
        return "01_10"
    elif 11 <= day <= 20:
        return "11_20"
    else:
        return "21_END"

def get_ndvi_color_rgb(val: float) -> tuple:
    """
    Returns RGBA tuple (0-255) for an NDVI float value.
    NoData or NaN returns transparent (0, 0, 0, 0).
    """
    if val is None or not (val == val) or val == -9999.0 or val < -1.0 or val > 1.0:
        return (0, 0, 0, 0)
    
    # Scientific color ramp for NDVI
    if val < 0.0:
        # Water/Snow/Cloud -> Blue/Cyan
        t = max(0.0, (val + 1.0) / 1.0)
        return (int(30 * t), int(60 * t), int(180 + 75 * t), 255)
    elif val < 0.2:
        # Bare Soil / Rock -> Sand / Brown
        t = val / 0.2
        return (int(160 + 40 * t), int(120 + 30 * t), int(50 - 30 * t), 255)
    elif val < 0.4:
        # Low Vegetation / Sparse -> Yellow-Green
        t = (val - 0.2) / 0.2
        return (int(200 - 80 * t), int(210 + 30 * t), int(20 + 10 * t), 255)
    elif val < 0.6:
        # Moderate Vegetation -> Light Green
        t = (val - 0.4) / 0.2
        return (int(100 - 80 * t), int(220 + 15 * t), int(30 + 10 * t), 255)
    else:
        # Dense Healthy Vegetation -> Dark Emerald Green
        t = (val - 0.6) / 0.4
        return (int(20 - 15 * t), int(140 + 75 * t), int(40 - 20 * t), 255)
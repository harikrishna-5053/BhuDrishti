import os
import re
import shutil


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


# ==========================================================
# PRODUCT TYPE CHECK
# ==========================================================

def is_l2a_product(name):

    return "MSIL2A" in name.upper()


# ==========================================================
# BAND VALIDATION
# ==========================================================

def has_required_bands(band_info):

    required = ["red", "nir", "scl"]

    return all(b in band_info for b in required)
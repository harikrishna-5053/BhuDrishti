import zipfile
import tempfile
import os
import shutil


# ==========================================================
# ZIP EXTRACTION MANAGER (CONTROLLED)
# ==========================================================

def extract_zip_if_valid(zip_path, intersects, logger=None):

    # ======================================================
    # SKIP INVALID ZIPS
    # ======================================================

    if not intersects:
        if logger:
            logger.info(f"Skipped ZIP (Outside India): {zip_path}")
        return None, None


    # ======================================================
    # CREATE TEMP EXTRACTION ROOT
    # ======================================================

    extract_dir = tempfile.mkdtemp(prefix="NRSC_SAFE_")

    if logger:
        logger.info(f"Extracting ZIP: {zip_path}")

    # ======================================================
    # EXTRACT ZIP
    # =====================================================

    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(extract_dir)

    except zipfile.BadZipFile as e:
        if logger:
            logger.error(f"Corrupted ZIP: {zip_path} | {e}")

        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)

        return None, None

    except Exception as e:
        if logger:
            logger.error(f"ZIP extraction failed: {zip_path} | {e}")

        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)

        return None, None       

    
    # ======================================================
    # FIND SAFE ROOT
    # ======================================================

    safe_roots = []

    for root, dirs, files in os.walk(extract_dir):
        for d in dirs:
            if d.endswith(".SAFE"):
                safe_roots.append(os.path.join(root, d))

    # ======================================================
    # VALIDATION
    # ======================================================

    if len(safe_roots) == 0:
        if logger:
            logger.error(f"No SAFE product found: {zip_path}")
        return extract_dir, []

    if logger:
        logger.info(f"SAFE products found: {len(safe_roots)}")

    return extract_dir, safe_roots
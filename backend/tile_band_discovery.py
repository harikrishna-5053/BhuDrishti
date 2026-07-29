import os
from utils import get_tile_id
# ==========================================================
# DISCOVER TILES AND BANDS
# ==========================================================

def discover_tiles(safe_path, logger=None):

    tiles = {}

    # ======================================================
    # WALK THROUGH SAFE STRUCTURE
    # ======================================================

    for root, _, files in os.walk(safe_path):

        for file in files:

            if not file.lower().endswith(".jp2"):
                continue
                

            filename = file.upper()
            full_path = os.path.join(root, file)

            # ==================================================
            # IDENTIFY TILE ID
            # ==================================================

            tile_id = get_tile_id(filename)

            if tile_id == "UNKNOWN":
                continue

            tiles.setdefault(tile_id, {})

            # ==================================================
            # RED BAND (B04)
            # ==================================================

            if "_B04" in filename and "10M" in filename:
                tiles[tile_id]["red"] = full_path

            # ==================================================
            # NIR BAND (B08)
            # ==================================================

            elif "_B08" in filename and "_B8A" not in filename:
                tiles[tile_id]["nir"] = full_path

            # ==================================================
            # SCL BAND
            # ==================================================

            elif "_SCL" in filename:
                tiles[tile_id]["scl"] = full_path

    if logger:
        logger.info(f"Tiles Found: {len(tiles)}")

    return tiles
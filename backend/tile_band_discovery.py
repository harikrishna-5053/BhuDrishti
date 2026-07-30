import os
import re
from dataclasses import dataclass
from typing import Dict, List, Optional
from utils import get_tile_id

@dataclass
class TileBandSet:
    tile_id: str
    b04_path: str
    b08_path: str
    scl_path: str
    b04_resolution: str = "10m"
    b08_resolution: str = "10m"
    scl_resolution: str = "20m"

def discover_tiles_structured(safe_path: str, logger=None) -> Dict[str, TileBandSet]:
    """
    Deterministically discovers Sentinel-2 L2A tile spectral bands (B04 10m, B08 10m, SCL 20m).
    Rejects preview images, TCI, B08A, QI_DATA, AUX_DATA, and non-target resolutions.
    Reports clear validation errors on duplicate candidates.
    """
    candidates: Dict[str, Dict[str, List[str]]] = {}

    for root, _, files in os.walk(safe_path):
        root_upper = root.upper().replace("\\", "/")

        # Skip quality, auxiliary, preview, and html folders
        if any(ignored in root_upper for ignored in ("/QI_DATA", "/AUX_DATA", "/HTML", "/PREVIEW")):
            continue

        for file in sorted(files):
            ext = file.lower().split(".")[-1]
            if ext not in ("jp2", "tif", "tiff"):
                continue

            filename_upper = file.upper()

            # Reject previews, quicklooks, and TCI
            if any(term in filename_upper for term in ("PREW", "PVI", "_TCI", "TCI_", "PREVIEW")):
                continue

            # Extract tile ID (e.g. T46RDR)
            tile_id = get_tile_id(filename_upper)
            if tile_id == "UNKNOWN":
                # Try from root directory path if not in filename
                tile_id = get_tile_id(root_upper)
                if tile_id == "UNKNOWN":
                    continue

            candidates.setdefault(tile_id, {"b04": [], "b08": [], "scl": []})

            full_path = os.path.join(root, file)

            # --- B04 10m Candidate ---
            # Must contain B04 or B4, must NOT be 20m/60m or in R20m/R60m folders
            if ("_B04" in filename_upper or "_B4" in filename_upper) and not ("_B04_20M" in filename_upper or "_B04_60M" in filename_upper or "R20M" in root_upper or "R60M" in root_upper or "20M" in filename_upper or "60M" in filename_upper):
                if "10M" in filename_upper or "R10M" in root_upper:
                    candidates[tile_id]["b04"].append(full_path)

            # --- B08 10m Candidate ---
            # Must contain B08 or B8, must NOT be B8A / B08A, must NOT be 20m/60m or in R20m/R60m folders
            elif ("_B08" in filename_upper or "_B8" in filename_upper) and not ("B8A" in filename_upper or "B08A" in filename_upper or "20M" in filename_upper or "60M" in filename_upper or "R20M" in root_upper or "R60M" in root_upper):
                if "10M" in filename_upper or "R10M" in root_upper:
                    candidates[tile_id]["b08"].append(full_path)

            # --- SCL 20m Candidate ---
            # Must contain SCL, must be 20m or in R20m folder, must NOT be 10m/60m or in R10m/R60m folders
            elif "_SCL" in filename_upper and not ("10M" in filename_upper or "60M" in filename_upper or "R10M" in root_upper or "R60M" in root_upper):
                if "20M" in filename_upper or "R20M" in root_upper:
                    candidates[tile_id]["scl"].append(full_path)

    structured_tiles: Dict[str, TileBandSet] = {}

    for tile_id in sorted(candidates.keys()):
        b04_candidates = sorted(list(set(candidates[tile_id]["b04"])))
        b08_candidates = sorted(list(set(candidates[tile_id]["b08"])))
        scl_candidates = sorted(list(set(candidates[tile_id]["scl"])))

        # Validation Check for Duplicate Candidates
        if len(b04_candidates) > 1:
            msg = f"Validation Error for Tile {tile_id}: Ambiguous multiple B04 10m candidates found: {b04_candidates}"
            if logger:
                logger.error(msg)
            print(f"[BAND DISCOVERY ERROR] {msg}")
            continue
        if len(b08_candidates) > 1:
            msg = f"Validation Error for Tile {tile_id}: Ambiguous multiple B08 10m candidates found: {b08_candidates}"
            if logger:
                logger.error(msg)
            print(f"[BAND DISCOVERY ERROR] {msg}")
            continue
        if len(scl_candidates) > 1:
            msg = f"Validation Error for Tile {tile_id}: Ambiguous multiple SCL 20m candidates found: {scl_candidates}"
            if logger:
                logger.error(msg)
            print(f"[BAND DISCOVERY ERROR] {msg}")
            continue

        if not b04_candidates:
            msg = f"Tile {tile_id} skipped: Required B04 10m band file not found."
            if logger:
                logger.warning(msg)
            print(f"[BAND DISCOVERY WARNING] {msg}")
            continue
        if not b08_candidates:
            msg = f"Tile {tile_id} skipped: Required B08 10m band file not found."
            if logger:
                logger.warning(msg)
            print(f"[BAND DISCOVERY WARNING] {msg}")
            continue
        if not scl_candidates:
            msg = f"Tile {tile_id} skipped: Required SCL 20m band file not found."
            if logger:
                logger.warning(msg)
            print(f"[BAND DISCOVERY WARNING] {msg}")
            continue

        structured_tiles[tile_id] = TileBandSet(
            tile_id=tile_id,
            b04_path=b04_candidates[0],
            b08_path=b08_candidates[0],
            scl_path=scl_candidates[0],
            b04_resolution="10m",
            b08_resolution="10m",
            scl_resolution="20m",
        )

    if logger:
        logger.info(f"Sentinel-2 Tiles Discovered: {len(structured_tiles)}")

    return structured_tiles

def discover_tiles(safe_path: str, logger=None) -> Dict[str, Dict[str, str]]:
    """
    Public entrypoint preserving 100% backwards compatibility with callers expecting
    { tile_id: { "red": b04_path, "nir": b08_path, "scl": scl_path } }.
    """
    structured = discover_tiles_structured(safe_path, logger=logger)
    legacy_tiles: Dict[str, Dict[str, str]] = {}
    for tile_id, band_set in structured.items():
        legacy_tiles[tile_id] = {
            "red": band_set.b04_path,
            "nir": band_set.b08_path,
            "scl": band_set.scl_path,
        }
    return legacy_tiles
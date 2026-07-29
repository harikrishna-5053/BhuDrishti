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
    Rejects ambiguous candidate files and non-preferred resolutions.
    """
    # 1. Collect all JP2 candidates per tile_id
    candidates: Dict[str, Dict[str, List[str]]] = {}

    for root, _, files in os.walk(safe_path):
        for file in sorted(files):
            if not file.lower().endswith(".jp2"):
                continue

            filename_upper = file.upper()
            full_path = os.path.join(root, file)
            tile_id = get_tile_id(filename_upper)
            if tile_id == "UNKNOWN":
                continue

            candidates.setdefault(tile_id, {"b04": [], "b08": [], "scl": []})

            # Check band types and resolution indicators
            if "_B04" in filename_upper and "10M" in filename_upper:
                candidates[tile_id]["b04"].append(full_path)
            elif "_B08" in filename_upper and "_B8A" not in filename_upper and "10M" in filename_upper:
                candidates[tile_id]["b08"].append(full_path)
            elif "_SCL" in filename_upper and "20M" in filename_upper:
                candidates[tile_id]["scl"].append(full_path)

    structured_tiles: Dict[str, TileBandSet] = {}

    for tile_id in sorted(candidates.keys()):
        b04_candidates = sorted(list(set(candidates[tile_id]["b04"])))
        b08_candidates = sorted(list(set(candidates[tile_id]["b08"])))
        scl_candidates = sorted(list(set(candidates[tile_id]["scl"])))

        # 2. Ambiguity & Resolution Checks
        if len(b04_candidates) > 1:
            msg = f"Tile {tile_id} skipped: Ambiguous multiple B04 10m files found: {b04_candidates}"
            if logger:
                logger.warning(msg)
            print(msg)
            continue
        if len(b08_candidates) > 1:
            msg = f"Tile {tile_id} skipped: Ambiguous multiple B08 10m files found: {b08_candidates}"
            if logger:
                logger.warning(msg)
            print(msg)
            continue
        if len(scl_candidates) > 1:
            msg = f"Tile {tile_id} skipped: Ambiguous multiple SCL 20m files found: {scl_candidates}"
            if logger:
                logger.warning(msg)
            print(msg)
            continue

        if not b04_candidates:
            msg = f"Tile {tile_id} skipped: Required B04 10m band was not found."
            if logger:
                logger.warning(msg)
            continue
        if not b08_candidates:
            msg = f"Tile {tile_id} skipped: Required B08 10m band was not found."
            if logger:
                logger.warning(msg)
            continue
        if not scl_candidates:
            msg = f"Tile {tile_id} skipped: Required SCL 20m band was not found."
            if logger:
                logger.warning(msg)
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
        logger.info(f"Tiles Found: {len(structured_tiles)}")

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
import os
import math
import io
import logging
from pathlib import Path
from typing import Optional, Tuple
import numpy as np
from PIL import Image

try:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.warp import transform_bounds, reproject
    from rasterio.windows import Window
except ImportError:
    rasterio = None

logger = logging.getLogger(__name__)

# ==========================================================
# CENTRAL NDVI COLOUR SCALE DEFINITION (Part 5.5)
# ==========================================================
# NoData: Transparent [0, 0, 0, 0]
# < 0.0   : Water / Snow / Cloud [44, 123, 182, 255]
# 0.0-0.2 : Non-Vegetation       [215, 25, 28, 255] -> [253, 174, 97, 255]
# 0.2-0.4 : Sparse Vegetation    [255, 255, 191, 255]
# 0.4-0.6 : Moderate Vegetation  [166, 217, 106, 255]
# >= 0.6  : Dense Vegetation     [26, 150, 65, 255]

def colorize_ndvi_array(data: np.ndarray, nodata: float = -9999.0) -> Image.Image:
    """
    Applies the shared scientific NDVI colormap to a 2D float array in < 10ms.
    Returns an RGBA PIL Image with transparent NoData.
    """
    h, w = data.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    # Valid pixel mask
    valid_mask = np.isfinite(data) & (data != nodata) & (data >= -1.0) & (data <= 1.0)
    
    # 1. Water / Negative NDVI (< 0.0) -> Deep Blue
    m_water = valid_mask & (data < 0.0)
    rgba[m_water] = [44, 123, 182, 255]

    # 2. Non-Vegetation / Bare Soil (0.0 <= NDVI < 0.2) -> Red / Orange
    m_nonveg = valid_mask & (data >= 0.0) & (data < 0.2)
    rgba[m_nonveg] = [215, 25, 28, 255]

    # 3. Sparse Vegetation (0.2 <= NDVI < 0.4) -> Yellow / Light Green
    m_sparse = valid_mask & (data >= 0.2) & (data < 0.4)
    rgba[m_sparse] = [255, 255, 191, 255]

    # 4. Moderate Vegetation (0.4 <= NDVI < 0.6) -> Green
    m_mod = valid_mask & (data >= 0.4) & (data < 0.6)
    rgba[m_mod] = [166, 217, 106, 255]

    # 5. Dense Vegetation (NDVI >= 0.6) -> Deep Dark Green
    m_dense = valid_mask & (data >= 0.6)
    rgba[m_dense] = [26, 150, 65, 255]

    return Image.fromarray(rgba, mode="RGBA")


def tile_xyz_to_epsg3857_bounds(z: int, x: int, y: int) -> Tuple[float, float, float, float]:
    """Calculates EPSG:3857 Web Mercator bounding box (min_x, min_y, max_x, max_y) in meters."""
    earth_radius = 6378137.0
    initial_resolution = 2 * math.pi * earth_radius / 256.0
    origin_shift = 2 * math.pi * earth_radius / 2.0

    res = initial_resolution / (2 ** z)
    min_x = x * 256 * res - origin_shift
    max_x = (x + 1) * 256 * res - origin_shift
    max_y = origin_shift - y * 256 * res
    min_y = origin_shift - (y + 1) * 256 * res
    return min_x, min_y, max_x, max_y


def render_tile_png(
    raster_path: str,
    z: int,
    x: int,
    y: int,
    cache_dir: Optional[Path] = None,
    version_hash: str = "v1"
) -> Optional[Path]:
    """
    Renders an XYZ tile (256x256 PNG) for Web Mercator (EPSG:3857) map display.
    Handles CRS conversion, windowed reading, reprojection, and disk caching.
    """
    if cache_dir:
        tile_file = cache_dir / version_hash / str(z) / str(x) / f"{y}.png"
        if tile_file.exists():
            return tile_file

    if not rasterio or not os.path.exists(raster_path):
        return None

    try:
        # EPSG:3857 Tile Bounds
        min_x, min_y, max_x, max_y = tile_xyz_to_epsg3857_bounds(z, x, y)
        tile_dst_transform = rasterio.transform.from_bounds(min_x, min_y, max_x, max_y, 256, 256)

        with rasterio.open(raster_path) as src:
            nodata_val = float(src.nodata) if src.nodata is not None else -9999.0

            # Transform EPSG:3857 bounds to source raster CRS
            src_bounds = transform_bounds("EPSG:3857", src.crs, min_x, min_y, max_x, max_y, densify_pts=21)
            left, bottom, right, top = src_bounds

            # Compute source window
            window = rasterio.windows.from_bounds(left, bottom, right, top, transform=src.transform)
            window = window.round_offsets().round_shape()

            # Clamp window to raster dimensions
            win_col_start = max(0, int(window.col_off))
            win_row_start = max(0, int(window.row_off))
            win_col_stop = min(src.width, int(window.col_off + window.width))
            win_row_stop = min(src.height, int(window.row_off + window.height))

            if win_col_stop <= win_col_start or win_row_stop <= win_row_start:
                # Return empty transparent 256x256 tile
                blank_img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
                if cache_dir:
                    tile_file.parent.mkdir(parents=True, exist_ok=True)
                    blank_img.save(tile_file, "PNG")
                    return tile_file
                return None

            read_win = Window(
                col_off=win_col_start,
                row_off=win_row_start,
                width=win_col_stop - win_col_start,
                height=win_row_stop - win_row_start
            )

            # Read source window array
            src_data = src.read(1, window=read_win, out_dtype=np.float32)
            src_win_transform = rasterio.windows.transform(read_win, src.transform)

            # Reproject to 256x256 EPSG:3857 destination tile
            dst_data = np.full((256, 256), nodata_val, dtype=np.float32)
            reproject(
                source=src_data,
                destination=dst_data,
                src_transform=src_win_transform,
                src_crs=src.crs,
                src_nodata=nodata_val,
                dst_transform=tile_dst_transform,
                dst_crs="EPSG:3857",
                dst_nodata=nodata_val,
                resampling=Resampling.nearest
            )

            # Colorize with shared colormap
            img = colorize_ndvi_array(dst_data, nodata=nodata_val)

            if cache_dir:
                tile_file.parent.mkdir(parents=True, exist_ok=True)
                img.save(tile_file, "PNG")
                return tile_file

            # Fallback to temp file if no cache dir passed
            temp_path = Path(raster_path).parent / f"tile_{z}_{x}_{y}.png"
            img.save(temp_path, "PNG")
            return temp_path

    except Exception as err:
        logger.error(f"Tile rendering error for {raster_path} ({z}/{x}/{y}): {err}")
        return None


def render_preview_png(raster_path: str, cache_file: Optional[Path] = None) -> Optional[Path]:
    """
    Renders a fast colourized overview preview PNG (max 1024x1024) for immediate map extent display.
    """
    if cache_file and cache_file.exists():
        return cache_file

    if not rasterio or not os.path.exists(raster_path):
        return None

    try:
        with rasterio.open(raster_path) as src:
            nodata_val = float(src.nodata) if src.nodata is not None else -9999.0
            max_dim = max(src.width, src.height)
            decimate = max(1, math.ceil(max_dim / 1024.0))

            target_w = max(1, src.width // decimate)
            target_h = max(1, src.height // decimate)

            data = src.read(
                1,
                out_shape=(target_h, target_w),
                resampling=Resampling.nearest,
                out_dtype=np.float32
            )

            img = colorize_ndvi_array(data, nodata=nodata_val)
            out_p = cache_file or (Path(raster_path).parent / f"{Path(raster_path).stem}_preview.png")
            out_p.parent.mkdir(parents=True, exist_ok=True)
            img.save(out_p, "PNG")
            return out_p

    except Exception as err:
        logger.error(f"Preview rendering error for {raster_path}: {err}")
        return None

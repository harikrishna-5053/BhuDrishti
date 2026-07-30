import os
import time
from typing import Tuple, Any, Optional, Callable, Dict

try:
    from osgeo import gdal
except ImportError:
    try:
        import gdal
    except ImportError:
        from gdal_compat import gdal


try:
    import numpy as np
except ImportError:
    np = None

from utils import INVALID_SCL_CLASSES

if gdal and hasattr(gdal, "UseExceptions"):
    gdal.UseExceptions()

def generate_ndvi_file(
    red_path: str,
    nir_path: str,
    scl_resampled: Any,
    output_tif: str,
    block_size: int = 2048,
    nodata_value: float = -9999.0,
    logger: Optional[Any] = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
) -> Tuple[str, int]:
    """
    Computes NDVI blockwise using genuine window-based processing and writes directly to output GeoTIFF.
    No full-image raster array is allocated in system memory.
    Temporary arrays are released immediately after writing each block.
    """
    if gdal is None or np is None:
        raise ImportError("GDAL and NumPy are required for NDVI processing")

    os.makedirs(os.path.dirname(output_tif), exist_ok=True)

    red_ds = gdal.Open(red_path, gdal.GA_ReadOnly)
    nir_ds = gdal.Open(nir_path, gdal.GA_ReadOnly)

    if red_ds is None or nir_ds is None:
        raise Exception("Cannot open RED or NIR band dataset")

    try:
        width = red_ds.RasterXSize
        height = red_ds.RasterYSize

        if (width != nir_ds.RasterXSize) or (height != nir_ds.RasterYSize):
            raise Exception(f"Shape mismatch RED:({width}x{height}) NIR:({nir_ds.RasterXSize}x{nir_ds.RasterYSize})")

        if (width != scl_resampled.RasterXSize) or (height != scl_resampled.RasterYSize):
            raise Exception(f"Shape mismatch RED:({width}x{height}) SCL:({scl_resampled.RasterXSize}x{scl_resampled.RasterYSize})")

        red_band = red_ds.GetRasterBand(1)
        nir_band = nir_ds.GetRasterBand(1)
        scl_band = scl_resampled.GetRasterBand(1)

        red_nodata = red_band.GetNoDataValue()
        nir_nodata = nir_band.GetNoDataValue()

        # Create output dataset with tiled blocks and Float32 datatype
        driver = gdal.GetDriverByName("GTiff")
        out_ds = driver.Create(
            output_tif,
            width,
            height,
            1,
            gdal.GDT_Float32,
            options=["COMPRESS=LZW", "TILED=YES", "BLOCKXSIZE=256", "BLOCKYSIZE=256"]
        )

        if out_ds is None:
            raise Exception(f"Failed to create output GeoTIFF file at '{output_tif}'")

        out_ds.SetGeoTransform(red_ds.GetGeoTransform())
        out_ds.SetProjection(red_ds.GetProjection())
        out_ds.SetMetadataItem("TITLE", "BhuDrishti Sentinel-2 Tile NDVI")
        out_ds.SetMetadataItem("PROCESSING_ENGINE", "BhuDrishti Python CPU Pipeline")

        out_band = out_ds.GetRasterBand(1)
        out_band.SetNoDataValue(float(nodata_value))

        valid_pixel_count = 0
        invalid_scl_list = list(INVALID_SCL_CLASSES)
        compute_start = time.perf_counter()

        y_ranges = list(range(0, height, block_size))
        x_ranges = list(range(0, width, block_size))
        total_blocks = len(y_ranges) * len(x_ranges)
        current_block = 0

        # Iterate over image windows (block processing)
        for yoff in y_ranges:
            ysize = min(block_size, height - yoff)
            for xoff in x_ranges:
                xsize = min(block_size, width - xoff)
                current_block += 1

                # 1. Read RED block
                r_blk = red_band.ReadAsArray(xoff, yoff, xsize, ysize).astype(np.float32)

                # 2. Read NIR block
                n_blk = nir_band.ReadAsArray(xoff, yoff, xsize, ysize).astype(np.float32)

                # 3. Read aligned SCL block
                s_blk = np.squeeze(scl_band.ReadAsArray(xoff, yoff, xsize, ysize))

                # Initialize block output to nodata_value
                blk_ndvi = np.full((ysize, xsize), nodata_value, dtype=np.float32)

                # 4. Apply cloud mask & valid checks
                valid = (r_blk > 0) & (n_blk > 0)
                if red_nodata is not None:
                    valid &= (r_blk != red_nodata)
                if nir_nodata is not None:
                    valid &= (n_blk != nir_nodata)

                valid &= ~np.isin(s_blk, invalid_scl_list)

                denom = n_blk + r_blk
                valid &= (denom != 0)

                # 5. Compute NDVI
                if np.any(valid):
                    blk_ndvi[valid] = (n_blk[valid] - r_blk[valid]) / denom[valid]
                    valid_pixel_count += int(np.sum(valid))

                # 6. Write block directly to output dataset
                out_band.WriteArray(blk_ndvi, xoff, yoff)

                # 7. Release temporary block arrays immediately
                del r_blk, n_blk, s_blk, blk_ndvi, valid, denom

                if progress_callback and total_blocks > 0:
                    pct = round((current_block / total_blocks) * 100, 1)
                    progress_callback({
                        "stage": "ndvi_generation",
                        "current": current_block,
                        "total": total_blocks,
                        "message": f"Computing NDVI window block {current_block}/{total_blocks} ({pct:.0f}%)"
                    })

        out_band.FlushCache()
        out_ds.FlushCache()

        out_band = None
        out_ds = None

        compute_end = time.perf_counter()
        elapsed = compute_end - compute_start

        msg = f"CPU Blockwise NDVI Generation ({block_size}x{block_size} window) completed in {elapsed:.4f}s. Valid pixels: {valid_pixel_count}"
        print(f"\n==============================\n{msg}\n==============================")
        if logger:
            logger.info(msg)

        if valid_pixel_count == 0:
            raise Exception(f"No valid non-cloud NDVI pixels were calculated in '{output_tif}'")

        return output_tif, valid_pixel_count

    finally:
        red_ds = None
        nir_ds = None

def generate_ndvi(red_path: str, nir_path: str, scl_resampled: Any, logger: Optional[Any] = None) -> Tuple[np.ndarray, Any]:
    """
    Legacy helper for backwards compatibility. Note: generate_ndvi_file is preferred.
    """
    red_ds = gdal.Open(red_path, gdal.GA_ReadOnly)
    width = red_ds.RasterXSize
    height = red_ds.RasterYSize
    tmp_out = f"temp_ndvi_{int(time.time()*1000)}.tif"
    try:
        generate_ndvi_file(red_path, nir_path, scl_resampled, tmp_out, block_size=2048, logger=logger)
        tmp_ds = gdal.Open(tmp_out, gdal.GA_ReadOnly)
        ndvi = tmp_ds.GetRasterBand(1).ReadAsArray()
        tmp_ds = None
        return ndvi, red_ds
    finally:
        if os.path.exists(tmp_out):
            try:
                os.remove(tmp_out)
            except Exception:
                pass
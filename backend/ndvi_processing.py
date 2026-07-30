try:
    from osgeo import gdal
except ImportError:
    try:
        import gdal
    except ImportError:
        gdal = None
try:
    import numpy as np
except ImportError:
    np = None
import time

if gdal and hasattr(gdal, "UseExceptions"):
    gdal.UseExceptions()

# ==========================================================
# NDVI GENERATION MODULE
# ==========================================================

def generate_ndvi(red_path, nir_path, scl_resampled, logger=None):

    red_ds = None
    nir_ds = None
    
    try:

        # ==================================================
        # OPEN RED & NIR
        # ==================================================


        red_ds = gdal.Open(red_path)
        nir_ds = gdal.Open(nir_path)

        if red_ds is None or nir_ds is None:
            raise Exception("Cannot open RED/NIR band")

        if (red_ds.RasterXSize != nir_ds.RasterXSize) or (red_ds.RasterYSize != nir_ds.RasterYSize):
            raise Exception(f"Shape mismatch RED:({red_ds.RasterXSize}x{red_ds.RasterYSize}) NIR:({nir_ds.RasterXSize}x{nir_ds.RasterYSize})")

        # ==================================================
        # BLOCKWISE NDVI COMPUTATION (Memory Bounded)
        # ==================================================
        width = red_ds.RasterXSize
        height = red_ds.RasterYSize
        block_size = 2048

        red_band = red_ds.GetRasterBand(1)
        nir_band = nir_ds.GetRasterBand(1)
        scl_band = scl_resampled.GetRasterBand(1)

        red_nodata = red_band.GetNoDataValue()
        nir_nodata = nir_band.GetNoDataValue()

        # SCL classes to mask as invalid/nodata (-9999.0):
        # 0: No Data, 1: Saturated/Defective, 2: Dark Area / Cast Shadows,
        # 3: Cloud Shadows, 8: Cloud Medium Prob, 9: Cloud High Prob, 10: Thin Cirrus
        invalid_scl = {0, 1, 2, 3, 8, 9, 10}

        ndvi = np.full((height, width), -9999.0, dtype=np.float32)
        compute_start = time.perf_counter()

        for yoff in range(0, height, block_size):
            ysize = min(block_size, height - yoff)
            for xoff in range(0, width, block_size):
                xsize = min(block_size, width - xoff)

                r_blk = red_band.ReadAsArray(xoff, yoff, xsize, ysize).astype(np.float32)
                n_blk = nir_band.ReadAsArray(xoff, yoff, xsize, ysize).astype(np.float32)
                s_blk = np.squeeze(scl_band.ReadAsArray(xoff, yoff, xsize, ysize))

                valid = (r_blk > 0) & (n_blk > 0)
                if red_nodata is not None:
                    valid &= (r_blk != red_nodata)
                if nir_nodata is not None:
                    valid &= (n_blk != nir_nodata)

                valid &= ~np.isin(s_blk, list(invalid_scl))

                denom = n_blk + r_blk
                valid &= (denom != 0)

                blk_ndvi = np.zeros((ysize, xsize), dtype=np.float32)
                np.divide(n_blk - r_blk, denom, out=blk_ndvi, where=valid)

                sub_out = ndvi[yoff : yoff + ysize, xoff : xoff + xsize]
                sub_out[valid] = blk_ndvi[valid]

        compute_end = time.perf_counter()

        print("\n==============================")
        print(f"CPU BLOCKWISE NDVI COMPUTATION TIME : {compute_end-compute_start:.6f} seconds")
        print("==============================")

        # ==================================================
        # FINAL VALIDATION
        # ==================================================

        valid_ndvi = ndvi[ndvi != -9999]

        if valid_ndvi.size == 0:
            raise Exception("No valid NDVI pixels")

        # ==================================================
        # STATS
        # ==================================================

        if logger:
            logger.info(
                f"NDVI Stats | Min={valid_ndvi.min():.4f} | Max={valid_ndvi.max():.4f}"
            )
            
        return ndvi, red_ds

    finally:

        red_ds = None
        nir_ds = None
        scl_ds = None
        scl_resampled = None
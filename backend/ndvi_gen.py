from osgeo import gdal
import numpy as np
import cupy as cp
import time
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

        red = cp.asarray(
            np.squeeze(red_ds.ReadAsArray()).astype(np.float32)
        )

        nir = cp.asarray(
            np.squeeze(nir_ds.ReadAsArray()).astype(np.float32)
        )
        # ==================================================
        # SHAPE CHECK
        # ==================================================

        if red.shape != nir.shape:
            raise Exception(f"Shape mismatch RED:{red.shape} NIR:{nir.shape}")

        # ==================================================
        # NODATA HANDLING
        # ==================================================

        red_nodata = red_ds.GetRasterBand(1).GetNoDataValue()
        nir_nodata = nir_ds.GetRasterBand(1).GetNoDataValue()

        valid_mask = cp.ones(red.shape, dtype=cp.bool_)

        valid_mask &= (red > 0)
        valid_mask &= (nir > 0)

        if red_nodata is not None:
            valid_mask &= (red != red_nodata)

        if nir_nodata is not None:
            valid_mask &= (nir != nir_nodata)

        # ==================================================
        # OPEN SCL
        # ==================================================

        scl = cp.asarray(
            np.squeeze(scl_resampled.ReadAsArray())
        )

        # ==================================================
        # CLOUD / INVALID MASK
        # ==================================================

        invalid_scl = cp.array([0,1,3,8,9,10,11], dtype=cp.uint8)
        valid_mask &= ~cp.isin(scl, invalid_scl)

        # ==================================================
        # NDVI COMPUTATION
        # ==================================================

        compute_start = time.perf_counter()
        
        denom = nir + red

        ndvi = cp.full(red.shape, -9999, dtype=cp.float32)

        mask = valid_mask & (denom != 0)

        ndvi[mask] = ((nir[mask] - red[mask]) / denom[mask])

        cp.cuda.Stream.null.synchronize()

        compute_end = time.perf_counter()

        print("\n==============================")
        print(f"GPU NDVI COMPUTATION TIME : {compute_end-compute_start:.6f} seconds")
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
                f"NDVI Stats | "
                f"Min={float(cp.min(valid_ndvi)):.4f} | "
                f"Max={float(cp.max(valid_ndvi)):.4f}"
            )

        ndvi = cp.asnumpy(ndvi)   
        cp.get_default_memory_pool().free_all_blocks()             
        return ndvi, red_ds

    finally:

        red_ds = None
        nir_ds = None
        scl_ds = None
        scl_resampled = None
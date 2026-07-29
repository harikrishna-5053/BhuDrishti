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

        red = red_ds.ReadAsArray().astype(np.float32)
        nir = nir_ds.ReadAsArray().astype(np.float32)

        red = np.squeeze(red)
        nir = np.squeeze(nir)

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

        valid_mask = np.ones(red.shape, dtype=bool)

        valid_mask &= (red > 0)
        valid_mask &= (nir > 0)

        if red_nodata is not None:
            valid_mask &= (red != red_nodata)

        if nir_nodata is not None:
            valid_mask &= (nir != nir_nodata)

        # ==================================================
        # OPEN SCL
        # ==================================================

        scl = np.squeeze(scl_resampled.ReadAsArray())

        # ==================================================
        # CLOUD / INVALID MASK
        # ==================================================

        invalid_scl = {
            0, 1, 3, 8, 9, 10, 11
        }

        valid_mask &= ~np.isin(scl, list(invalid_scl))

        # ==================================================
        # NDVI COMPUTATION
        # ==================================================

        ndvi = np.full(red.shape, -9999, dtype=np.float32)
        compute_start = time.perf_counter()

        denom = nir + red

        valid_mask &= (denom != 0)

        ndvi_vals = np.zeros_like(red, dtype=np.float32)

        np.divide(
            nir - red,
            denom,
            out=ndvi_vals,
            where=valid_mask
        )

        ndvi[valid_mask] = ndvi_vals[valid_mask]
        compute_end = time.perf_counter()

        print("\n==============================")
        print(f"CPU NDVI COMPUTATION TIME : {compute_end-compute_start:.6f} seconds")
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
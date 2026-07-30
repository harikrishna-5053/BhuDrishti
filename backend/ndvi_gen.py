try:
    from osgeo import gdal
except ImportError:
    try:
        import gdal
    except ImportError:
        gdal = None

try:
    import cupy as cp
    HAS_CUPY = True
except ImportError:
    cp = None
    HAS_CUPY = False

if gdal and hasattr(gdal, "UseExceptions"):
    gdal.UseExceptions()

def is_gpu_available() -> bool:
    if not HAS_CUPY or cp is None:
        return False
    try:
        return cp.cuda.runtime.getDeviceCount() > 0
    except Exception:
        return False

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

        # SCL classes to mask as invalid/nodata (-9999.0):
        # 0: No Data, 1: Saturated/Defective, 2: Dark Area / Cast Shadows,
        # 3: Cloud Shadows, 8: Cloud Medium Prob, 9: Cloud High Prob, 10: Thin Cirrus
        invalid_scl = cp.array([0, 1, 2, 3, 8, 9, 10], dtype=cp.uint8)
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
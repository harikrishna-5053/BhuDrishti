import os
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

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    matplotlib = None
    plt = None



# ==========================================================
# SAVE NDVI AS GEOTIFF
# ==========================================================

def save_ndvi_tiff(ndvi, reference_ds, output_tif, logger=None):

    os.makedirs(os.path.dirname(output_tif), exist_ok=True)

    driver = gdal.GetDriverByName("GTiff")

    out_ds = driver.Create(
        output_tif,
        ndvi.shape[1],
        ndvi.shape[0],
        1,
        gdal.GDT_Float32
    )

    if out_ds is None:
        raise Exception(f"Failed GeoTIFF: {output_tif}")

    out_ds.SetGeoTransform(reference_ds.GetGeoTransform())
    out_ds.SetProjection(reference_ds.GetProjection())

    band = out_ds.GetRasterBand(1)
    band.SetNoDataValue(-9999)
    band.WriteArray(ndvi)

    band.FlushCache()
    out_ds.FlushCache()
    out_ds = None

    print(f"\nSAVING TIFF TO:\n{output_tif}")

    if logger:
        logger.info(f"TIFF saved: {output_tif}")


# ==========================================================
# SAVE NDVI AS PNG
# ==========================================================

def save_ndvi_png(ndvi, output_png, tile_id, logger=None):

    os.makedirs(os.path.dirname(output_png), exist_ok=True)

    display = ndvi.copy()
    display[display == -9999] = np.nan

    plt.figure(figsize=(10, 8))
    img = plt.imshow(display, cmap="RdYlGn", vmin=-1, vmax=1)
    plt.title(tile_id)
    plt.axis("off")
    plt.colorbar(img)

    plt.savefig(output_png, dpi=300, bbox_inches="tight")
    plt.close()

    print(f"\nSAVING PNG TO:\n{output_png}")

    if logger:
        logger.info(f"PNG saved: {output_png}")
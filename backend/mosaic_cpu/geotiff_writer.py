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



class GeoTiffWriter:


    def __init__(self):

        self.dataset = None



    def create(
            self,
            filename,
            width,
            height,
            bands=1,
            dtype=getattr(gdal, "GDT_Float32", 6)
    ):


        driver = gdal.GetDriverByName(
            "GTiff"
        )


        self.dataset = driver.Create(

            filename,

            width,

            height,

            bands,

            dtype,

            options=[

                "COMPRESS=LZW",

                "TILED=YES",

                "BIGTIFF=YES",

                "NUM_THREADS=ALL_CPUS"

            ]

        )



        if self.dataset is None:

            raise RuntimeError(
                "Failed creating GeoTIFF"
            )



    def set_geo_transform(
            self,
            transform
    ):


        self.dataset.SetGeoTransform(
            transform
        )



    def set_projection(
            self,
            projection
    ):


        self.dataset.SetProjection(
            projection
        )



    def set_nodata(
            self,
            value=-9999
    ):


        band = self.dataset.GetRasterBand(1)


        band.SetNoDataValue(
            value
        )



    def write_block(
            self,
            data,
            xoff,
            yoff,
            band=1
    ):


        if data.dtype != np.float32:

            data = data.astype(
                np.float32
            )



        raster_band = (

            self.dataset
            .GetRasterBand(band)

        )


        raster_band.WriteArray(

            data,

            xoff,

            yoff

        )


    def close(self):


        if self.dataset:

            self.dataset.FlushCache()

            self.dataset = None
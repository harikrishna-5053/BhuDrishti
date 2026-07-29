from osgeo import gdal


class GeoTiffWriter:


    def __init__(self):

        self.dataset = None



    def create(
            self,
            filename,
            width,
            height,
            projection,
            geo_transform):


        driver = gdal.GetDriverByName(
            "GTiff"
        )


        self.dataset = driver.Create(

            filename,

            width,

            height,

            1,

            gdal.GDT_Float32,

            options=[

                "BIGTIFF=YES",

                "TILED=YES",

                "COMPRESS=DEFLATE",

                "PREDICTOR=3",

                "NUM_THREADS=ALL_CPUS"

            ]

        )


        if self.dataset is None:

            raise RuntimeError(
                "Cannot create output TIFF"
            )


        self.dataset.SetProjection(
            projection
        )


        self.dataset.SetGeoTransform(
            geo_transform
        )


        band = (
            self.dataset
            .GetRasterBand(1)
        )


        band.SetNoDataValue(
            -9999
        )



    def write_block(
            self,
            data,
            xoff,
            yoff):


        band = (
            self.dataset
            .GetRasterBand(1)
        )


        band.WriteArray(
            data,
            xoff,
            yoff
        )


        band.FlushCache()



    def close(self):

        if self.dataset:

            self.dataset.FlushCache()

            self.dataset = None
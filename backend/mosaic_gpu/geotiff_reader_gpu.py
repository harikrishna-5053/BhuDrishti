from osgeo import gdal, osr
import numpy as np


class GeoTiffReader:


    def __init__(self):

        self.dataset = None

        self.filename = ""

        self.width = 0
        self.height = 0

        self.projection = ""

        self.geo_transform = None

        self.epsg = None

        self.pixel_size_x = None
        self.pixel_size_y = None



    def open(self, filename):

        self.filename = filename


        self.dataset = gdal.Open(
            filename,
            gdal.GA_ReadOnly
        )


        if self.dataset is None:

            raise RuntimeError(
                f"Cannot open {filename}"
            )


        self.width = (
            self.dataset.RasterXSize
        )

        self.height = (
            self.dataset.RasterYSize
        )


        self.projection = (
            self.dataset.GetProjection()
        )


        self.geo_transform = (
            self.dataset.GetGeoTransform()
        )


        self.pixel_size_x = (
            self.geo_transform[1]
        )

        self.pixel_size_y = abs(
            self.geo_transform[5]
        )


        self.get_epsg()



    def get_epsg(self):

        srs = osr.SpatialReference()

        srs.ImportFromWkt(
            self.projection
        )


        epsg = srs.GetAuthorityCode(None)


        if epsg:

            self.epsg = int(epsg)


        else:

            raise RuntimeError(
                "EPSG not found"
            )



    def get_bounds(self):

        gt = self.geo_transform


        xmin = gt[0]

        ymax = gt[3]


        xmax = (
            xmin +
            self.width *
            gt[1]
        )


        ymin = (
            ymax +
            self.height *
            gt[5]
        )


        return (
            xmin,
            ymin,
            xmax,
            ymax
        )



    def read_block(
            self,
            xoff,
            yoff,
            width,
            height):


        band = (
            self.dataset
            .GetRasterBand(1)
        )


        data = band.ReadAsArray(
            xoff,
            yoff,
            width,
            height
        )


        if data is None:

            return None


        return data.astype(
            np.float32
        )



    def close(self):

        self.dataset = None
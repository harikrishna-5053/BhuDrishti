try:
    from osgeo import gdal, osr
except ImportError:
    try:
        import gdal
        import osr
    except ImportError:
        gdal = None
        osr = None
try:
    import numpy as np
except ImportError:
    np = None
try:
    from pyproj import Transformer
except ImportError:
    Transformer = None



class GeoTiffReader:


    def __init__(self):

        self.dataset = None

        self.imageWidth = 0
        self.imageHeight = 0

        self.noBands = 0

        self.geoTransform = None

        self.projection = ""

        self.transformer = None

        self.xRes = 0
        self.yRes = 0



    def open(self, filename):


        self.dataset = gdal.Open(
            filename,
            gdal.GA_ReadOnly
        )


        if self.dataset is None:

            raise RuntimeError(
                f"Cannot open {filename}"
            )



        self.imageWidth = (
            self.dataset.RasterXSize
        )


        self.imageHeight = (
            self.dataset.RasterYSize
        )


        self.noBands = (
            self.dataset.RasterCount
        )



        self.geoTransform = (
            self.dataset.GetGeoTransform()
        )


        self.projection = (
            self.dataset.GetProjection()
        )



        source = osr.SpatialReference()

        source.ImportFromWkt(
            self.projection
        )


        epsg = source.GetAuthorityCode(None)



        if epsg:

            self.transformer = Transformer.from_crs(

                f"EPSG:{epsg}",

                "EPSG:4326",

                always_xy=True

            )

        else:

            raise RuntimeError(
                "Invalid CRS"
            )



        self.xRes = self.geoTransform[1]

        self.yRes = abs(
            self.geoTransform[5]
        )



    def get_corner_latlon(self):

        """
        Returns:

        lon_min,
        lat_min,
        lon_max,
        lat_max

        after EPSG:4326 conversion
        """

        gt = self.geoTransform


        width = self.imageWidth

        height = self.imageHeight



        corners = [

            (0,0),

            (width,0),

            (0,height),

            (width,height)

        ]


        lons = []

        lats = []



        for px,py in corners:


            x = (
                gt[0]
                +
                px*gt[1]
                +
                py*gt[2]
            )


            y = (
                gt[3]
                +
                px*gt[4]
                +
                py*gt[5]
            )



            lon,lat = self.transformer.transform(

                x,

                y

            )


            lons.append(lon)

            lats.append(lat)



        return (

            min(lons),

            min(lats),

            max(lons),

            max(lats)

        )



    def get_upper_left_latlon(self):


        x = self.geoTransform[0]

        y = self.geoTransform[3]


        lon,lat = self.transformer.transform(

            x,

            y

        )


        return lon,lat




    def read_block(
            self,
            band=1,
            xoff=0,
            yoff=0,
            xsize=None,
            ysize=None
    ):


        if xsize is None:

            xsize = self.imageWidth


        if ysize is None:

            ysize = self.imageHeight



        raster_band = (

            self.dataset
            .GetRasterBand(band)

        )



        data = raster_band.ReadAsArray(

            xoff,

            yoff,

            xsize,

            ysize

        )


        return data.astype(
            np.float32
        )



    def close(self):

        self.dataset = None
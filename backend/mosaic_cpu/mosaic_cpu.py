import os
try:
    import numpy as np
except ImportError:
    np = None

try:
    from osgeo import osr
except ImportError:
    try:
        import osr
    except ImportError:
        osr = None

from .geotiff_reader import GeoTiffReader
from .geotiff_writer import GeoTiffWriter

from .utils import (
    calculate_bounds,
    get_upper_left_latlon,
    calculate_pixel_position
)


class MosaicCPU:


    def __init__(self):

        self.input_files = []

        self.output_file = ""

        self.resolution = 0.00000898

        self.bounds = None

        self.width = 0

        self.height = 0

        self.tiles = []



    def add_files(self, files):

        self.input_files = files



    def set_output(self, filename):

        self.output_file = filename



    def calculate_mosaic_extent(self):


        all_longitudes = []

        all_latitudes = []

        self.tiles = []



        print("\nCalculating common EPSG:4326 canvas")



        for file in self.input_files:


            reader = GeoTiffReader()

            reader.open(file)



            bounds = calculate_bounds(
                reader
            )


            lon_min, lat_min, lon_max, lat_max = bounds



            print("\n--------------------------------")

            print(
                os.path.basename(file)
            )


            print(
                "Longitude Min:",
                lon_min
            )

            print(
                "Longitude Max:",
                lon_max
            )

            print(
                "Latitude Min:",
                lat_min
            )

            print(
                "Latitude Max:",
                lat_max
            )



            self.tiles.append({

                "file": file,

                "bounds": bounds

            })



            all_longitudes.extend(
                [
                    lon_min,
                    lon_max
                ]
            )


            all_latitudes.extend(
                [
                    lat_min,
                    lat_max
                ]
            )


            reader.close()



        canvas_min_lon = min(
            all_longitudes
        )


        canvas_max_lon = max(
            all_longitudes
        )


        canvas_min_lat = min(
            all_latitudes
        )


        canvas_max_lat = max(
            all_latitudes
        )



        self.bounds = (

            canvas_min_lon,

            canvas_min_lat,

            canvas_max_lon,

            canvas_max_lat

        )



        self.width = int(

            (
                canvas_max_lon
                -
                canvas_min_lon
            )
            /
            self.resolution
            +
            0.5

        )



        self.height = int(

            (
                canvas_max_lat
                -
                canvas_min_lat
            )
            /
            self.resolution
            +
            0.5

        )



        print("\n================================")

        print("FINAL COMMON CANVAS")

        print("================================")


        print(
            "Longitude Min:",
            canvas_min_lon
        )

        print(
            "Longitude Max:",
            canvas_max_lon
        )

        print(
            "Latitude Min:",
            canvas_min_lat
        )

        print(
            "Latitude Max:",
            canvas_max_lat
        )


        print()

        print(
            "Canvas Width:",
            self.width
        )

        print(
            "Canvas Height:",
            self.height
        )





    def create_mosaic(self):


        self.calculate_mosaic_extent()



        xmin, ymin, xmax, ymax = self.bounds



        writer = GeoTiffWriter()



        writer.create(

            self.output_file,

            self.width,

            self.height

        )



        writer.set_geo_transform(

            (

                xmin,

                self.resolution,

                0,

                ymax,

                0,

                -self.resolution

            )

        )



        srs = osr.SpatialReference()

        srs.ImportFromEPSG(
            4326
        )


        writer.set_projection(
            srs.ExportToWkt()
        )


        writer.set_nodata(
            -9999
        )



        print(
            "\nOutput canvas created"
        )

        writer.dataset.GetRasterBand(1).Fill(-9999)

        for tile in self.tiles:



            file = tile["file"]



            print(
                "\nProcessing:",
                os.path.basename(file)
            )



            reader = GeoTiffReader()

            reader.open(file)



            # -------------------------------------
            # Mentor placement formula
            # -------------------------------------


            current_lon, current_lat = get_upper_left_latlon(
                reader
            )



            start_row, start_col = calculate_pixel_position(

                current_lon,

                current_lat,

                xmin,

                ymax,

                self.resolution,

                self.resolution

            )



            print(
                "Start Row:",
                start_row
            )

            print(
                "Start Col:",
                start_col
            )



            output_band = writer.dataset.GetRasterBand(1)



            block_size = 4096



            for yoff in range(
                0,
                reader.imageHeight,
                block_size
            ):


                for xoff in range(
                    0,
                    reader.imageWidth,
                    block_size
                ):



                    xsize = min(

                        block_size,

                        reader.imageWidth-xoff

                    )


                    ysize = min(

                        block_size,

                        reader.imageHeight-yoff

                    )



                    data = reader.read_block(

                        xoff=xoff,

                        yoff=yoff,

                        xsize=xsize,

                        ysize=ysize

                    )



                    dest_col = start_col + xoff

                    dest_row = start_row + yoff



                    if (

                        dest_col < 0

                        or

                        dest_row < 0

                        or

                        dest_col+xsize > self.width

                        or

                        dest_row+ysize > self.height

                    ):

                        continue




                    existing = output_band.ReadAsArray(

                        dest_col,

                        dest_row,

                        xsize,

                        ysize

                    )



                    if existing is None:


                        existing = np.full(

                            (
                                ysize,
                                xsize
                            ),

                            -9999,

                            dtype=np.float32

                        )



                    valid = data != -9999



                    existing[valid] = np.maximum(

                        existing[valid],

                        data[valid]

                    )



                    writer.write_block(

                        existing,

                        xoff=dest_col,

                        yoff=dest_row

                    )



            reader.close()



        writer.close()



        print(

            "\nMosaic created:",

            self.output_file

        )
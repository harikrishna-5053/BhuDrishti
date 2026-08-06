import os
from datetime import datetime

import numpy as np

from osgeo import gdal, osr

from .geotiff_reader import GeoTiffReader
from .geotiff_writer import GeoTiffWriter

from .utils import calculate_bounds


class MosaicCPU:

    def __init__(self):
        self.input_files = []
        self.output_file = ""

        # EPSG:4326 resolution
        self.resolution = 0.0001

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


            bounds = calculate_bounds(reader)

            lon_min, lat_min, lon_max, lat_max = bounds


            print("\n--------------------------------")
            print(os.path.basename(file))
            print("Longitude Min:", lon_min)
            print("Longitude Max:", lon_max)
            print("Latitude Min:", lat_min)
            print("Latitude Max:", lat_max)



            self.tiles.append({
                "file": file,
                "bounds": bounds
            })


            all_longitudes.extend([
                lon_min,
                lon_max
            ])

            all_latitudes.extend([
                lat_min,
                lat_max
            ])


            reader.close()



        xmin = min(all_longitudes)
        xmax = max(all_longitudes)

        ymin = min(all_latitudes)
        ymax = max(all_latitudes)



        self.bounds = (
            xmin,
            ymin,
            xmax,
            ymax
        )


        self.width = int(
            (xmax - xmin) /
            self.resolution
            + 0.5
        )


        self.height = int(
            (ymax - ymin) /
            self.resolution
            + 0.5
        )



        print("\n================================")
        print("FINAL COMMON CANVAS")
        print("================================")

        print("Longitude Min:", xmin)
        print("Longitude Max:", xmax)
        print("Latitude Min:", ymin)
        print("Latitude Max:", ymax)

        print("Canvas Width:", self.width)
        print("Canvas Height:", self.height)




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
        srs.ImportFromEPSG(4326)



        writer.set_nodata(-9999.0)


        writer.set_metadata({

            "TITLE":
            "BhuDrishti Sentinel-2 NDVI Mosaic",

            "PROCESSING_ENGINE":
            "BhuDrishti Python Pipeline",

            "COMPOSITE_METHOD":
            "Maximum Value Composite (MVC)",

            "CREATION_DATE":
            datetime.utcnow().isoformat()+"Z",

            "NODATA":
            "-9999.0",

        })



        print("\nOutput canvas created")



        output_band = writer.dataset.GetRasterBand(1)

        output_band.Fill(-9999.0)



        warped_tiles = []



        # -----------------------------------------
        # CREATE ALIGNED EPSG:4326 VRTs
        # -----------------------------------------

        for tile in self.tiles:


            file = tile["file"]


            try:


                warp_options = gdal.WarpOptions(

                    format="VRT",

                    dstSRS="EPSG:4326",


                    # IMPORTANT FIX
                    outputBounds=[
                        xmin,
                        ymin,
                        xmax,
                        ymax
                    ],


                    xRes=self.resolution,

                    yRes=self.resolution,


                    resampleAlg=gdal.GRA_NEAREST,


                    srcNodata=-9999.0,

                    dstNodata=-9999.0

                )



                vrt = gdal.Warp(
                    "",
                    file,
                    options=warp_options
                )



                if vrt is not None:

                    warped_tiles.append(
                        (
                            file,
                            vrt
                        )
                    )



            except Exception as e:

                print(
                    "Warp failed:",
                    file,
                    e
                )





        # -----------------------------------------
        # MAXIMUM VALUE COMPOSITE
        # -----------------------------------------


        for file_path, vrt_ds in warped_tiles:


            band = vrt_ds.GetRasterBand(1)


            arr = band.ReadAsArray()


            if arr is None:
                continue



            gt = vrt_ds.GetGeoTransform()



            tile_xmin = gt[0]
            tile_ymax = gt[3]



            col_offset = int(
                round(
                    (tile_xmin - xmin)
                    /
                    self.resolution
                )
            )


            row_offset = int(
                round(
                    (ymax - tile_ymax)
                    /
                    self.resolution
                )
            )



            tile_height, tile_width = arr.shape



            # boundary protection

            if col_offset < 0 or row_offset < 0:
                continue


            if (
                col_offset + tile_width > self.width
                or
                row_offset + tile_height > self.height
            ):

                tile_width = min(
                    tile_width,
                    self.width - col_offset
                )

                tile_height = min(
                    tile_height,
                    self.height - row_offset
                )


                arr = arr[
                    :tile_height,
                    :tile_width
                ]



            existing = output_band.ReadAsArray(
                col_offset,
                row_offset,
                tile_width,
                tile_height
            )



            if existing is None:
                continue



            valid = (

                (arr != -9999.0)

                &
                (arr >= -1)

                &
                (arr <= 1)

                &
                (~np.isnan(arr))

            )



            if not np.any(valid):
                continue



            empty = (
                existing == -9999.0
            )



            existing[
                empty & valid
            ] = arr[
                empty & valid
            ]



            overlap = (
                (~empty)
                &
                valid
            )



            existing[
                overlap
            ] = np.maximum(
                existing[overlap],
                arr[overlap]
            )



            output_band.WriteArray(
                existing,
                col_offset,
                row_offset
            )





        for _, vrt in warped_tiles:
            vrt = None



        writer.close()



        print(
            "\nMosaic created:",
            self.output_file
        )
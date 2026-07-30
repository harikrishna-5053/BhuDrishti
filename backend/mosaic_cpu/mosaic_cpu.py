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
        self.resolution = 0.0001  # Target resolution in EPSG:4326 (~10m)
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

            all_longitudes.extend([lon_min, lon_max])
            all_latitudes.extend([lat_min, lat_max])
            reader.close()

        canvas_min_lon = min(all_longitudes)
        canvas_max_lon = max(all_longitudes)
        canvas_min_lat = min(all_latitudes)
        canvas_max_lat = max(all_latitudes)

        self.bounds = (
            canvas_min_lon,
            canvas_min_lat,
            canvas_max_lon,
            canvas_max_lat
        )

        self.width = max(1, int((canvas_max_lon - canvas_min_lon) / self.resolution + 0.5))
        self.height = max(1, int((canvas_max_lat - canvas_min_lat) / self.resolution + 0.5))

        print("\n================================")
        print("FINAL COMMON CANVAS")
        print("================================")
        print("Longitude Min:", canvas_min_lon)
        print("Longitude Max:", canvas_max_lon)
        print("Latitude Min:", canvas_min_lat)
        print("Latitude Max:", canvas_max_lat)
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

        writer.set_geo_transform((
            xmin,
            self.resolution,
            0,
            ymax,
            0,
            -self.resolution
        ))

        srs = osr.SpatialReference()
        srs.ImportFromEPSG(4326)
        writer.set_nodata(-9999.0)
        writer.set_metadata({
            "TITLE": "BhuDrishti Sentinel-2 NDVI Mosaic",
            "PROCESSING_ENGINE": "BhuDrishti Python Pipeline",
            "COMPOSITE_METHOD": "Maximum Value Composite (MVC)",
            "CREATION_DATE": datetime.utcnow().isoformat() + "Z",
            "NODATA": "-9999.0",
        })

        print("\nOutput canvas created")
        output_band = writer.dataset.GetRasterBand(1)
        output_band.Fill(-9999.0)

        # Create warped in-memory VRT datasets for each input file aligned to target canvas
        warped_vrts = []
        for tile in self.tiles:
            file = tile["file"]
            try:
                warp_options = gdal.WarpOptions(
                    format="VRT",
                    dstSRS="EPSG:4326",
                    outputBounds=[xmin, ymin, xmax, ymax],
                    xRes=self.resolution,
                    yRes=self.resolution,
                    resampleAlg=gdal.GRA_Bilinear,
                    srcNodata=-9999.0,
                    dstNodata=-9999.0,
                )
                vrt_ds = gdal.Warp("", file, options=warp_options)
                if vrt_ds is not None:
                    warped_vrts.append((file, vrt_ds))
            except Exception as w_err:
                print(f"Warning: Failed to warp tile {file}: {w_err}")

        # Block-level Maximum Value Composite (MVC) processing
        block_size = 2048
        for yoff in range(0, self.height, block_size):
            ysize = min(block_size, self.height - yoff)
            for xoff in range(0, self.width, block_size):
                xsize = min(block_size, self.width - xoff)

                comp_block = np.full((ysize, xsize), -9999.0, dtype=np.float32)
                block_modified = False

                for file_path, vrt_ds in warped_vrts:
                    try:
                        vrt_band = vrt_ds.GetRasterBand(1)
                        tile_block = vrt_band.ReadAsArray(xoff, yoff, xsize, ysize)
                        if tile_block is None:
                            continue

                        valid = (tile_block != -9999.0) & (tile_block >= -1.0) & (tile_block <= 1.0) & ~np.isnan(tile_block)
                        if not np.any(valid):
                            continue

                        unfilled = (comp_block == -9999.0) & valid
                        comp_block[unfilled] = tile_block[unfilled]

                        overlap = (comp_block != -9999.0) & valid
                        comp_block[overlap] = np.maximum(comp_block[overlap], tile_block[overlap])

                        block_modified = True
                    except Exception as b_err:
                        print(f"Error reading block ({xoff}, {yoff}) from {file_path}: {b_err}")

                if block_modified:
                    output_band.WriteArray(comp_block, xoff, yoff)

        # Cleanup warped VRT handles
        for _, vrt_ds in warped_vrts:
            vrt_ds = None

        writer.close()
        print("\nMosaic created:", self.output_file)
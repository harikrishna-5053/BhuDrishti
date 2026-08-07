import os
from datetime import datetime

import numpy as np
try:
    from osgeo import gdal, osr
except ImportError:
    try:
        import gdal, osr
    except ImportError:
        from gdal_compat import gdal, osr

from .geotiff_writer import GeoTiffWriter

# Make GDAL raise Python exceptions instead of silently failing
try:
    if hasattr(gdal, "UseExceptions"):
        gdal.UseExceptions()
except Exception:
    pass

class MosaicCPU:
    def __init__(self):
        self.input_files = []
        self.output_file = ""
<<<<<<< HEAD

        # EPSG:4326 resolution
        self.resolution = 0.0001

=======
        # EPSG:4326 output resolution
        self.resolution = 0.0001
        # NDVI NoData
        self.nodata = -9999.0
        # Process raster in blocks
        self.block_size = 2048
>>>>>>> 67b15b2 (fix(backend): enhance gdal_compat Warp & WarpOptions for seamless mosaic_cpu execution)
        self.bounds = None
        self.width = 0
        self.height = 0

        self.tiles = []

<<<<<<< HEAD

=======
    # ---------------------------------------------------------
    # INPUT / OUTPUT
    # ---------------------------------------------------------
>>>>>>> 67b15b2 (fix(backend): enhance gdal_compat Warp & WarpOptions for seamless mosaic_cpu execution)
    def add_files(self, files):
        self.input_files = list(files)


    def set_output(self, filename):
        self.output_file = filename

<<<<<<< HEAD


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
=======
    # ---------------------------------------------------------
    # INSPECT ONE TILE
    # ---------------------------------------------------------
    def _inspect_tile(self, file_path):
        if not os.path.isfile(file_path):
            raise RuntimeError(f"Input TIFF does not exist: {file_path}")
        src_ds = None
        vrt_ds = None
        try:
            src_ds = gdal.Open(file_path, gdal.GA_ReadOnly)
            if src_ds is None:
                raise RuntimeError(f"Cannot open input TIFF: {file_path}")
            if src_ds.RasterCount < 1:
                raise RuntimeError(f"No raster band found: {file_path}")
            projection = src_ds.GetProjection()
            if not projection:
                raise RuntimeError(f"Input TIFF has no CRS: {file_path}")
            src_band = src_ds.GetRasterBand(1)
            src_nodata = src_band.GetNoDataValue()
            # -------------------------------------------------
            # Temporary VRT only for finding accurate
            # EPSG:4326 bounds.
            #
            # No raster data is loaded here.
            # -------------------------------------------------
            warp_kwargs = {
                "format": "VRT",
                "dstSRS": "EPSG:4326",
                "xRes": self.resolution,
                "yRes": self.resolution,
                "targetAlignedPixels": True,
                # IMPORTANT:
                # use string, NOT gdal.GRA_NEAREST
                "resampleAlg": "near",
                "dstNodata": self.nodata,
                "outputType": gdal.GDT_Float32,
            }
            if src_nodata is not None:
                warp_kwargs["srcNodata"] = float(src_nodata)
            warp_options = gdal.WarpOptions(**warp_kwargs)
            vrt_ds = gdal.Warp("", src_ds, options=warp_options)
            if vrt_ds is None:
                raise RuntimeError(f"Could not create EPSG:4326 VRT: {file_path}")
            gt = vrt_ds.GetGeoTransform()
            if gt is None:
                raise RuntimeError(f"Warped VRT has no GeoTransform: {file_path}")
            vrt_width = vrt_ds.RasterXSize
            vrt_height = vrt_ds.RasterYSize
            if vrt_width <= 0 or vrt_height <= 0:
                raise RuntimeError(f"Invalid warped dimensions: {file_path}")
            xmin = gt[0]
            ymax = gt[3]
            xmax = gt[0] + vrt_width * gt[1]
            ymin = gt[3] + vrt_height * gt[5]
            # Protect against reversed values
            lon_min = min(xmin, xmax)
            lon_max = max(xmin, xmax)
            lat_min = min(ymin, ymax)
            lat_max = max(ymin, ymax)
            return {
                "file": file_path,
                "bounds": (lon_min, lat_min, lon_max, lat_max),
                "width": vrt_width,
                "height": vrt_height,
                "src_nodata": src_nodata
            }
        finally:
            vrt_ds = None
            src_ds = None

    # ---------------------------------------------------------
    # CALCULATE COMMON EPSG:4326 CANVAS
    # ---------------------------------------------------------
    def calculate_mosaic_extent(self):
        if not self.input_files:
            raise RuntimeError("No input NDVI TIFF files were provided.")
        print("\n========================================")
        print("Calculating common EPSG:4326 canvas")
        print("========================================")
        self.tiles = []
        all_xmin = []
        all_ymin = []
        all_xmax = []
        all_ymax = []
        # Remove duplicates while preserving sorted order
        unique_files = sorted(set(self.input_files))
        for index, file_path in enumerate(unique_files, start=1):
            print(f"\nInspecting tile {index}/{len(unique_files)}:")
            print(os.path.basename(file_path))
            tile = self._inspect_tile(file_path)
            self.tiles.append(tile)
            lon_min, lat_min, lon_max, lat_max = tile["bounds"]
            all_xmin.append(lon_min)
            all_ymin.append(lat_min)
            all_xmax.append(lon_max)
            all_ymax.append(lat_max)
>>>>>>> 67b15b2 (fix(backend): enhance gdal_compat Warp & WarpOptions for seamless mosaic_cpu execution)
            print("Longitude Min:", lon_min)
            print("Longitude Max:", lon_max)
            print("Latitude Min:", lat_min)
            print("Latitude Max:", lat_max)
<<<<<<< HEAD



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

=======
        if not self.tiles:
            raise RuntimeError("No valid NDVI tiles found.")
        # Because each tile was created using
        # targetAlignedPixels=True, all these
        # boundaries lie on the same resolution grid.
        xmin = min(all_xmin)
        ymin = min(all_ymin)
        xmax = max(all_xmax)
        ymax = max(all_ymax)
        self.width = int(round((xmax - xmin) / self.resolution))
        self.height = int(round((ymax - ymin) / self.resolution))
        if self.width <= 0 or self.height <= 0:
            raise RuntimeError("Invalid mosaic canvas dimensions.")
        # Recalculate exact bounds from the pixel grid.
        # This prevents 1-pixel floating-point differences.
        xmax = xmin + self.width * self.resolution
        ymin = ymax - self.height * self.resolution
        self.bounds = (xmin, ymin, xmax, ymax)
        print("\n========================================")
        print("FINAL COMMON CANVAS")
        print("========================================")
>>>>>>> 67b15b2 (fix(backend): enhance gdal_compat Warp & WarpOptions for seamless mosaic_cpu execution)
        print("Longitude Min:", xmin)
        print("Longitude Max:", xmax)
        print("Latitude Min:", ymin)
        print("Latitude Max:", ymax)
<<<<<<< HEAD

=======
>>>>>>> 67b15b2 (fix(backend): enhance gdal_compat Warp & WarpOptions for seamless mosaic_cpu execution)
        print("Canvas Width:", self.width)
        print("Canvas Height:", self.height)
        print("Resolution:", self.resolution)

<<<<<<< HEAD



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
=======
    # ---------------------------------------------------------
    # CREATE ONE TILE-SIZED ALIGNED VRT
    # ---------------------------------------------------------
    def _create_aligned_vrt(self, tile):
        file_path = tile["file"]
        tile_xmin, tile_ymin, tile_xmax, tile_ymax = tile["bounds"]
        tile_width = tile["width"]
        tile_height = tile["height"]
        src_nodata = tile["src_nodata"]
        warp_kwargs = {
            "format": "VRT",
            "dstSRS": "EPSG:4326",
            "outputBounds": [
                tile_xmin,
                tile_ymin,
                tile_xmax,
                tile_ymax
            ],
            # Supplying exact width/height guarantees
            # identical alignment with the inspected tile.
            "width": tile_width,
            "height": tile_height,
            "resampleAlg": "near",
            "dstNodata": self.nodata,
            "outputType": gdal.GDT_Float32,
            "multithread": True,
            "warpOptions": [
                "NUM_THREADS=ALL_CPUS"
            ],
        }
        if src_nodata is not None:
            warp_kwargs["srcNodata"] = float(src_nodata)
        options = gdal.WarpOptions(**warp_kwargs)
        vrt_ds = gdal.Warp("", file_path, options=options)
        if vrt_ds is None:
            raise RuntimeError(f"Warp failed: {file_path}")
        if vrt_ds.RasterXSize != tile_width or vrt_ds.RasterYSize != tile_height:
            vrt_ds = None
            raise RuntimeError(f"Warped VRT dimensions do not match expected dimensions for {file_path}")
        return vrt_ds

    # ---------------------------------------------------------
    # VERIFY FINAL FILE
    # ---------------------------------------------------------
    def _verify_output(self):
        if not os.path.isfile(self.output_file):
            raise RuntimeError("Mosaic output file was not created.")
        if os.path.getsize(self.output_file) <= 0:
            raise RuntimeError("Mosaic output file is empty.")
        ds = None
        try:
            ds = gdal.Open(self.output_file, gdal.GA_ReadOnly)
            if ds is None:
                raise RuntimeError("GDAL cannot open final mosaic.")
            if ds.RasterXSize != self.width or ds.RasterYSize != self.height:
                raise RuntimeError("Final mosaic dimensions are incorrect.")
            if ds.RasterCount != 1:
                raise RuntimeError("Final mosaic must contain one band.")
            projection = ds.GetProjection()
            if not projection:
                raise RuntimeError("Final mosaic has no CRS.")
            actual_srs = osr.SpatialReference()
            actual_srs.ImportFromWkt(projection)
            expected_srs = osr.SpatialReference()
            expected_srs.ImportFromEPSG(4326)
            try:
                actual_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                expected_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            except Exception:
                pass
            if not actual_srs.IsSame(expected_srs):
                raise RuntimeError("Final mosaic CRS is not EPSG:4326.")
            band = ds.GetRasterBand(1)
            if band.DataType != gdal.GDT_Float32:
                raise RuntimeError("Final mosaic is not Float32.")
            nodata = band.GetNoDataValue()
            if nodata is None:
                raise RuntimeError("Final mosaic has no NoData value.")
            if not np.isclose(nodata, self.nodata):
                raise RuntimeError("Final mosaic NoData value is incorrect.")
        finally:
            ds = None

    # ---------------------------------------------------------
    # CREATE MOSAIC
    # ---------------------------------------------------------
    def create_mosaic(self):
        if not self.output_file:
            raise RuntimeError("Output mosaic filename was not set.")
        # -----------------------------------------------------
        # Determine final canvas
        # -----------------------------------------------------
        self.calculate_mosaic_extent()
        xmin, ymin, xmax, ymax = self.bounds
        output_directory = os.path.dirname(os.path.abspath(self.output_file))
        os.makedirs(output_directory, exist_ok=True)
        # Remove any bad/incomplete previous file
        if os.path.isfile(self.output_file):
            os.remove(self.output_file)
        writer = None
        output_band = None
        any_valid_pixel = False
        total_valid_source_pixels = 0
        processed_tiles = 0
        try:
            # -------------------------------------------------
            # CREATE FINAL GEOTIFF
            # -------------------------------------------------
            writer = GeoTiffWriter()
            writer.create(self.output_file, self.width, self.height)
            writer.set_geo_transform((
                xmin,
                self.resolution,
                0.0,
                ymax,
                0.0,
                -self.resolution
            ))
            # ---------------------------------------------
            # IMPORTANT:
            # Actually write EPSG:4326 to output.
            # ---------------------------------------------
            srs = osr.SpatialReference()
            srs.ImportFromEPSG(4326)
            try:
                srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            except Exception:
                pass
            writer.set_projection(srs.ExportToWkt())
            writer.set_nodata(self.nodata)
            # Metadata written directly through GDAL.
            # This does not depend on GeoTiffWriter
            # having a set_metadata() method.
            writer.dataset.SetMetadata({
                "TITLE": "BhuDrishti Sentinel-2 NDVI Mosaic",
                "PROCESSING_ENGINE": "BhuDrishti Python Pipeline",
                "COMPOSITE_METHOD": "Maximum Value Composite (MVC)",
                "TARGET_CRS": "EPSG:4326",
                "RESAMPLING": "Nearest Neighbour",
                "CREATION_DATE": datetime.utcnow().isoformat() + "Z",
                "NODATA": str(self.nodata),
            })
            output_band = writer.dataset.GetRasterBand(1)
            # The complete canvas MUST begin as NoData.
            # Otherwise empty areas would become 0 NDVI.
            output_band.Fill(self.nodata)
            output_band.FlushCache()
            print("\n========================================")
            print("OUTPUT CANVAS CREATED")
            print("========================================")
            print("CRS: EPSG:4326")
            print("Resolution:", self.resolution)
            print("NoData:", self.nodata)
            print("Composite: Maximum NDVI")
            # -------------------------------------------------
            # PROCESS EACH TILE
            # -------------------------------------------------
            for tile_index, tile in enumerate(self.tiles, start=1):
                file_path = tile["file"]
                print("\n========================================")
                print(f"Processing tile {tile_index}/{len(self.tiles)}")
                print(os.path.basename(file_path))
                tile_xmin, tile_ymin, tile_xmax, tile_ymax = tile["bounds"]
                # ---------------------------------------------
                # Position of this warped tile on common canvas
                # ---------------------------------------------
                col_offset = int(round((tile_xmin - xmin) / self.resolution))
                row_offset = int(round((ymax - tile_ymax) / self.resolution))
                tile_width = tile["width"]
                tile_height = tile["height"]
                if col_offset < 0 or row_offset < 0:
                    raise RuntimeError(f"Negative mosaic tile offset for {file_path}")
                if col_offset + tile_width > self.width:
                    raise RuntimeError(f"Tile exceeds mosaic width: {file_path}")
                if row_offset + tile_height > self.height:
                    raise RuntimeError(f"Tile exceeds mosaic height: {file_path}")
                vrt_ds = None
                try:
                    # -----------------------------------------
                    # Warp ONLY this tile's area.
                    #
                    # We are NOT creating a full mosaic-sized
                    # VRT for every source TIFF.
                    # -----------------------------------------
                    vrt_ds = self._create_aligned_vrt(tile)
                    vrt_band = vrt_ds.GetRasterBand(1)
                    tile_valid_pixels = 0
                    # -----------------------------------------
                    # BLOCKWISE PROCESSING
                    # -----------------------------------------
                    for local_y in range(0, tile_height, self.block_size):
                        ysize = min(self.block_size, tile_height - local_y)
                        for local_x in range(0, tile_width, self.block_size):
                            xsize = min(self.block_size, tile_width - local_x)
                            tile_block = vrt_band.ReadAsArray(local_x, local_y, xsize, ysize)
                            if tile_block is None:
                                raise RuntimeError(f"Could not read warped block from {file_path}")
                            tile_block = np.asarray(tile_block, dtype=np.float32)
                            # ---------------------------------
                            # Valid NDVI
                            # ---------------------------------
                            valid = (
                                np.isfinite(tile_block)
                                & (tile_block != self.nodata)
                                & (tile_block >= -1.0)
                                & (tile_block <= 1.0)
                            )
                            if not np.any(valid):
                                continue
                            valid_count = int(np.count_nonzero(valid))
                            tile_valid_pixels += valid_count
                            total_valid_source_pixels += valid_count
                            output_x = col_offset + local_x
                            output_y = row_offset + local_y
                            existing = output_band.ReadAsArray(output_x, output_y, xsize, ysize)
                            if existing is None:
                                raise RuntimeError("Could not read output mosaic block.")
                            existing = np.asarray(existing, dtype=np.float32)
                            # Existing valid NDVI values
                            existing_valid = (
                                np.isfinite(existing)
                                & (existing != self.nodata)
                                & (existing >= -1.0)
                                & (existing <= 1.0)
                            )
                            # ---------------------------------
                            # Empty mosaic pixels:
                            # copy source NDVI
                            # ---------------------------------
                            new_pixels = valid & ~existing_valid
                            existing[new_pixels] = tile_block[new_pixels]
                            # ---------------------------------
                            # Overlap:
                            # Maximum Value Composite
                            # ---------------------------------
                            overlap = valid & existing_valid
                            if np.any(overlap):
                                existing[overlap] = np.maximum(existing[overlap], tile_block[overlap])
                            output_band.WriteArray(existing, output_x, output_y)
                    any_valid_pixel = True
                    processed_tiles += 1
                    print("Tile successfully processed.")
                    print("Valid source pixels:", tile_valid_pixels)
                except Exception as exc:
                    raise RuntimeError(f"Mosaic processing failed for {file_path}: {exc}") from exc
                finally:
                    vrt_ds = None
            # -------------------------------------------------
            # ENSURE SOMETHING WAS ACTUALLY WRITTEN
            # -------------------------------------------------
            if not any_valid_pixel:
                raise RuntimeError("Mosaic contains zero valid NDVI pixels.")
            if processed_tiles != len(self.tiles):
                raise RuntimeError("Not all input NDVI tiles were successfully processed.")
            # -------------------------------------------------
            # FINISH OUTPUT
            # -------------------------------------------------
            output_band.FlushCache()
            writer.dataset.FlushCache()
            output_band = None
            writer.close()
            writer = None
            # -------------------------------------------------
            # STRUCTURAL VALIDATION
            # -------------------------------------------------
            self._verify_output()
            print("\n========================================")
            print("MOSAIC CREATED SUCCESSFULLY")
            print("========================================")
            print("Output:", self.output_file)
            print("Tiles processed:", processed_tiles)
            print("Valid source pixels processed:", total_valid_source_pixels)
            print("CRS: EPSG:4326")
            print("Composite: Maximum NDVI")
            return self.output_file
        except Exception:
            # Close output before deleting partial product
            try:
                output_band = None
                if writer is not None:
                    writer.close()
            except Exception:
                pass
            # Do not leave an invalid partial TIFF
            try:
                if os.path.isfile(self.output_file):
                    os.remove(self.output_file)
            except Exception:
                pass
            # Remove possible auxiliary metadata file
            aux_file = self.output_file + ".aux.xml"
            try:
                if os.path.isfile(aux_file):
                    os.remove(aux_file)
            except Exception:
                pass
            raise
>>>>>>> 67b15b2 (fix(backend): enhance gdal_compat Warp & WarpOptions for seamless mosaic_cpu execution)

import os
import numpy as np

try:
    from osgeo import gdal, ogr, osr
    HAS_NATIVE_GDAL = True
except ImportError:
    HAS_NATIVE_GDAL = False

if not HAS_NATIVE_GDAL:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.warp import reproject, Resampling as WarpResampling

    GDT_Float32 = 6

    class RasterioBandAdapter:
        def __init__(self, ds_adapter, band_idx=1):
            self.ds_adapter = ds_adapter
            self.band_idx = band_idx
            self.DataType = GDT_Float32

        def GetNoDataValue(self):
            ds = self.ds_adapter.ds
            nodatas = getattr(ds, "nodatavals", [None])
            val = nodatas[self.band_idx - 1] if nodatas else None
            if val is None:
                val = getattr(self.ds_adapter, "nodata", -9999.0)
            return val

        def SetNoDataValue(self, val):
            self.ds_adapter.nodata = val

        def ReadAsArray(self, xoff=0, yoff=0, win_xsize=None, win_ysize=None):
            ds = self.ds_adapter.ds
            if win_xsize is None or win_ysize is None:
                return np.ascontiguousarray(ds.read(self.band_idx))
            window = rasterio.windows.Window(xoff, yoff, win_xsize, win_ysize)
            return np.ascontiguousarray(ds.read(self.band_idx, window=window))

        def WriteArray(self, arr, xoff, yoff):
            ds = self.ds_adapter.ds
            window = rasterio.windows.Window(xoff, yoff, arr.shape[1], arr.shape[0])
            ds.write(arr, self.band_idx, window=window)

        def FlushCache(self):
            pass

    class RasterioDatasetAdapter:
        def __init__(self, filepath_or_ds, mode="r", width=None, height=None, crs=None, transform=None):
            self.mode = mode
            self.nodata = -9999.0
            self.gt = transform
            self.proj = crs
            self._ds = None

            if isinstance(filepath_or_ds, str):
                self.filepath = filepath_or_ds
                if mode == "r":
                    self._ds = rasterio.open(filepath_or_ds, "r")
                elif mode == "w":
                    self.width = width
                    self.height = height
            else:
                self._ds = filepath_or_ds  # MemoryFile dataset

        @property
        def ds(self):
            if self._ds is None and self.mode == "w":
                crs = rasterio.crs.CRS.from_string(self.proj) if self.proj else None
                if self.gt:
                    tf = rasterio.transform.Affine(self.gt[1], self.gt[2], self.gt[0], self.gt[4], self.gt[5], self.gt[3])
                else:
                    tf = None

                self._ds = rasterio.open(
                    self.filepath,
                    "w",
                    driver="GTiff",
                    height=self.height,
                    width=self.width,
                    count=1,
                    dtype=rasterio.float32,
                    crs=crs,
                    transform=tf,
                    nodata=self.nodata,
                    compress="lzw",
                    tiled=True,
                    blockxsize=256,
                    blockysize=256
                )
            return self._ds

        @property
        def RasterXSize(self):
            if self._ds is not None:
                return self._ds.width
            return self.width

        @property
        def RasterYSize(self):
            if self._ds is not None:
                return self._ds.height
            return self.height

        @property
        def RasterCount(self):
            if self._ds is not None:
                return self._ds.count
            return 1

        def GetRasterBand(self, band_idx=1):
            return RasterioBandAdapter(self, band_idx)

        def GetProjection(self):
            if self.proj:
                return self.proj
            if self._ds and self._ds.crs:
                return self._ds.crs.to_wkt()
            return ""

        def SetProjection(self, proj):
            self.proj = proj

        def GetGeoTransform(self):
            if self.gt:
                return self.gt
            if self._ds and self._ds.transform:
                t = self._ds.transform
                return (t.c, t.a, t.b, t.f, t.d, t.e)
            return (0.0, 1.0, 0.0, 0.0, 0.0, 1.0)

        def SetGeoTransform(self, gt):
            self.gt = gt

        def SetMetadataItem(self, name, val):
            pass

        def FlushCache(self):
            if self._ds is not None and self.mode == "w":
                try:
                    self._ds.close()
                except Exception:
                    pass
                self._ds = None

    class RasterioDriverAdapter:
        def Create(self, filename, width, height, count, datatype, options=None):
            return RasterioDatasetAdapter(filename, mode="w", width=width, height=height)

    class GDALModuleAdapter:
        GA_ReadOnly = 0
        GDT_Float32 = 6
        GRA_NearestNeighbour = 0

        @staticmethod
        def UseExceptions():
            pass

        @staticmethod
        def Open(filepath, mode=0):
            if isinstance(filepath, str):
                try:
                    return RasterioDatasetAdapter(filepath, mode="r")
                except Exception:
                    return None
            return filepath

        @staticmethod
        def GetDriverByName(name):
            return RasterioDriverAdapter()

        @staticmethod
        def WarpOptions(**kwargs):
            return kwargs

        @staticmethod
        def Warp(dest_name, src_ds, options=None, **kwargs):
            try:
                merged = {**(options if isinstance(options, dict) else {}), **kwargs}
                dstSRS = merged.get("dstSRS", "EPSG:4326")
                outputBounds = merged.get("outputBounds")
                width = merged.get("width")
                height = merged.get("height")
                res = merged.get("xRes", 0.0001)

                if isinstance(src_ds, str):
                    src_ds = RasterioDatasetAdapter(src_ds, mode="r")

                src_arr = src_ds.ds.read(1)
                src_crs = src_ds.ds.crs
                src_tf = src_ds.ds.transform

                dst_crs = rasterio.crs.CRS.from_string(dstSRS) if dstSRS else src_crs

                if width is None or height is None:
                    if outputBounds:
                        minx, miny, maxx, maxy = outputBounds
                        width = max(1, int(round((maxx - minx) / res)))
                        height = max(1, int(round((maxy - miny) / res)))
                        dst_tf = rasterio.transform.from_bounds(minx, miny, maxx, maxy, width, height)
                    else:
                        dst_tf, width, height = rasterio.warp.calculate_default_transform(
                            src_crs, dst_crs, src_ds.ds.width, src_ds.ds.height, *src_ds.ds.bounds, resolution=res
                        )
                else:
                    if outputBounds:
                        minx, miny, maxx, maxy = outputBounds
                        dst_tf = rasterio.transform.from_bounds(minx, miny, maxx, maxy, width, height)
                    else:
                        dst_tf = src_tf

                dst_arr = np.zeros((height, width), dtype=src_arr.dtype)
                reproject(
                    source=src_arr,
                    destination=dst_arr,
                    src_transform=src_tf,
                    src_crs=src_crs,
                    dst_transform=dst_tf,
                    dst_crs=dst_crs,
                    resampling=Resampling.nearest
                )

                mem_file = rasterio.MemoryFile()
                out_mem = mem_file.open(
                    driver="GTiff",
                    height=height,
                    width=width,
                    count=1,
                    dtype=dst_arr.dtype,
                    crs=dst_crs,
                    transform=dst_tf
                )
                out_mem.write(dst_arr, 1)
                return RasterioDatasetAdapter(out_mem, mode="mem", crs=dst_crs.to_wkt() if dst_crs else "", transform=(dst_tf.c, dst_tf.a, dst_tf.b, dst_tf.f, dst_tf.d, dst_tf.e))
            except Exception as e:
                print(f"GDAL Warp Adapter Error: {e}")
                return None

    class SpatialReferenceAdapter:
        def __init__(self, epsg=4326):
            self.epsg = epsg
            self.wkt = "EPSG:4326"

        def ImportFromEPSG(self, code):
            self.epsg = code
            self.wkt = f"EPSG:{code}"

        def ImportFromWkt(self, wkt):
            self.wkt = wkt

        def SetAxisMappingStrategy(self, strategy):
            pass

        def ExportToWkt(self):
            return self.wkt

        def IsSame(self, other):
            return True

        def GetAuthorityCode(self, target):
            return str(self.epsg) if hasattr(self, "epsg") else "4326"

    class OSRModuleAdapter:
        OAMS_TRADITIONAL_GIS_ORDER = 0
        SpatialReference = SpatialReferenceAdapter

    class OGRModuleAdapter:
        pass

    gdal = GDALModuleAdapter()
    osr = OSRModuleAdapter()
    ogr = OGRModuleAdapter()

import unittest
import numpy as np
import pyproj
import math
import tempfile
from pathlib import Path
import rasterio
from rasterio.transform import from_origin
from fastapi import HTTPException

from api.schemas import AOIAnalyticsRequest, AOIAnalyticsResponse
from api.routes.analytics import get_aoi_analytics, _find_result_file
from api.job_manager import get_job_manager

class TestAOIAnalysisComprehensive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create temp directory for synthetic rasters
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.dir_path = Path(cls.temp_dir.name)

        # 1. Create EPSG:4326 synthetic raster (100x100) around lat 17.5, lng 78.5
        # Top-left quadrant has NDVI 0.8, bottom-right has 0.2, center has -9999
        cls.wgs84_path = cls.dir_path / "synthetic_wgs84.tif"
        data_wgs84 = np.zeros((100, 100), dtype=np.float32)
        data_wgs84[0:50, 0:50] = 0.8  # Top-left high veg
        data_wgs84[50:100, 50:100] = 0.2  # Bottom-right low veg
        data_wgs84[25:35, 25:35] = -9999.0  # Nodata block inside top-left

        tf_wgs84 = from_origin(78.0, 18.0, 0.01, 0.01) # origin lng=78.0, lat=18.0, resolution 0.01 deg
        with rasterio.open(
            cls.wgs84_path, "w", driver="GTiff",
            height=100, width=100, count=1, dtype=np.float32,
            crs="EPSG:4326", transform=tf_wgs84, nodata=-9999.0
        ) as dst:
            dst.write(data_wgs84, 1)

        # 2. Create UTM EPSG:32644 synthetic raster (100x100)
        cls.utm_path = cls.dir_path / "synthetic_utm.tif"
        data_utm = np.full((100, 100), 0.6, dtype=np.float32)
        # UTM 44N coords near Hyderabad (easting 345000, northing 1935000)
        tf_utm = from_origin(345000.0, 1935000.0, 10.0, 10.0) # 10m resolution
        with rasterio.open(
            cls.utm_path, "w", driver="GTiff",
            height=100, width=100, count=1, dtype=np.float32,
            crs="EPSG:32644", transform=tf_utm, nodata=-9999.0
        ) as dst:
            dst.write(data_utm, 1)

        # 3. Create large synthetic raster (2000x2000)
        cls.large_path = cls.dir_path / "synthetic_large.tif"
        data_large = np.full((2000, 2000), 0.45, dtype=np.float32)
        tf_large = from_origin(78.0, 18.0, 0.001, 0.001)
        with rasterio.open(
            cls.large_path, "w", driver="GTiff",
            height=2000, width=2000, count=1, dtype=np.float32,
            crs="EPSG:4326", transform=tf_large, nodata=-9999.0
        ) as dst:
            dst.write(data_large, 1)

        # Register synthetic results in job manager
        manager = get_job_manager()
        manager._jobs["test_job"] = {
            "job_id": "test_job",
            "output_directory": str(cls.dir_path),
            "results_map": {
                "res_wgs84": {
                    "result_id": "res_wgs84",
                    "filename": "synthetic_wgs84.tif",
                    "absolute_path": str(cls.wgs84_path)
                },
                "res_utm": {
                    "result_id": "res_utm",
                    "filename": "synthetic_utm.tif",
                    "absolute_path": str(cls.utm_path)
                },
                "res_large": {
                    "result_id": "res_large",
                    "filename": "synthetic_large.tif",
                    "absolute_path": str(cls.large_path)
                }
            }
        }

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    # 1. Polygon with less than 3 vertices
    def test_01_polygon_less_than_3_vertices(self):
        geojson = {
            "type": "Polygon",
            "coordinates": [[[78.1, 17.9], [78.2, 17.9]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        with self.assertRaises(HTTPException) as cm:
            get_aoi_analytics(req)
        self.assertEqual(cm.exception.status_code, 400)

    # 2. Invalid polygon geometry
    def test_02_invalid_polygon_geometry(self):
        geojson = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [0, 0], [0, 0]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        with self.assertRaises(HTTPException) as cm:
            get_aoi_analytics(req)
        self.assertEqual(cm.exception.status_code, 400)

    # 3. Zero-area polygon
    def test_03_zero_area_polygon(self):
        geojson = {
            "type": "Polygon",
            "coordinates": [[[78.1, 17.9], [78.2, 17.9], [78.3, 17.9], [78.1, 17.9]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        with self.assertRaises(HTTPException) as cm:
            get_aoi_analytics(req)
        self.assertEqual(cm.exception.status_code, 400)

    # 4. Coordinate transformation EPSG:4326 to raster CRS (EPSG:32644)
    def test_04_coordinate_transform_epsg4326_to_raster_crs(self):
        # Inverse transform UTM (345100, 1934900) to EPSG:4326 lat/lng
        tr = pyproj.Transformer.from_crs("EPSG:32644", "EPSG:4326", always_xy=True)
        lng1, lat1 = tr.transform(345100, 1934900)
        lng2, lat2 = tr.transform(345900, 1934900)
        lng3, lat3 = tr.transform(345500, 1934100)

        geojson = {
            "type": "Polygon",
            "coordinates": [[[lng1, lat1], [lng2, lat2], [lng3, lat3], [lng1, lat1]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_utm"], geojson=geojson)
        resp = get_aoi_analytics(req)
        self.assertEqual(len(resp.series), 1)
        stat = resp.series[0]
        self.assertEqual(stat.status, "success")
        self.assertGreater(stat.valid_count, 0)
        self.assertAlmostEqual(stat.mean_ndvi, 0.6, places=2)

    # 5. Partial overlap
    def test_05_partial_overlap(self):
        # Polygon spanning from inside raster (lng=78.1, lat=17.9) to outside (lng=77.5, lat=17.9)
        geojson = {
            "type": "Polygon",
            "coordinates": [[[77.5, 17.9], [78.2, 17.9], [78.2, 17.5], [77.5, 17.5], [77.5, 17.9]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        resp = get_aoi_analytics(req)
        self.assertEqual(len(resp.series), 1)
        stat = resp.series[0]
        self.assertEqual(stat.status, "success")
        self.assertGreater(stat.valid_count, 0)

    # 6. No overlap
    def test_06_no_overlap(self):
        # Polygon completely away from raster (lng 10, lat 10)
        geojson = {
            "type": "Polygon",
            "coordinates": [[[10.0, 10.0], [10.1, 10.0], [10.1, 10.1], [10.0, 10.1], [10.0, 10.0]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        resp = get_aoi_analytics(req)
        self.assertEqual(len(resp.series), 1)
        stat = resp.series[0]
        self.assertEqual(stat.status, "no_overlap")
        self.assertEqual(stat.valid_count, 0)

    # 7. Nodata exclusion (-9999)
    def test_07_nodata_exclusion(self):
        # Polygon over top-left region containing the 10x10 nodata block (-9999)
        geojson = {
            "type": "Polygon",
            "coordinates": [[[78.2, 17.7], [78.4, 17.7], [78.4, 17.8], [78.2, 17.8], [78.2, 17.7]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        resp = get_aoi_analytics(req)
        stat = resp.series[0]
        self.assertEqual(stat.status, "success")
        self.assertGreater(stat.nodata_count, 0)
        self.assertAlmostEqual(stat.mean_ndvi, 0.8, places=2)

    # 8. Exact median calculation
    def test_08_exact_median(self):
        geojson = {
            "type": "Polygon",
            "coordinates": [[[78.01, 17.95], [78.15, 17.95], [78.15, 17.85], [78.01, 17.85], [78.01, 17.95]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        resp = get_aoi_analytics(req)
        stat = resp.series[0]
        self.assertAlmostEqual(stat.median_ndvi, 0.8, places=3)

    # 9. Pixel center inclusion
    def test_09_pixel_center_inclusion(self):
        # Polygon wrapping small region 5x5 pixels
        geojson = {
            "type": "Polygon",
            "coordinates": [[[78.01, 17.99], [78.06, 17.99], [78.06, 17.94], [78.01, 17.94], [78.01, 17.99]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson)
        resp = get_aoi_analytics(req)
        stat = resp.series[0]
        self.assertEqual(stat.status, "success")
        self.assertTrue(20 <= stat.valid_count <= 30)

    # 10. Bounding windowing performance (2000x2000 raster)
    def test_10_windowing_performance(self):
        geojson = {
            "type": "Polygon",
            "coordinates": [[[78.01, 17.99], [78.02, 17.99], [78.02, 17.98], [78.01, 17.98], [78.01, 17.99]]]
        }
        req = AOIAnalyticsRequest(result_ids=["res_large"], geojson=geojson)
        resp = get_aoi_analytics(req)
        stat = resp.series[0]
        self.assertEqual(stat.status, "success")
        self.assertLess(stat.valid_count, 500) # Small window, fast read

    # 11. Full raster comparison vs AOI polygon
    def test_11_full_raster_comparison(self):
        # Top-left quadrant has NDVI 0.8, bottom-right quadrant has NDVI 0.2
        # Select AOI strictly in top-left
        geojson_tl = {
            "type": "Polygon",
            "coordinates": [[[78.01, 17.99], [78.45, 17.99], [78.45, 17.55], [78.01, 17.55], [78.01, 17.99]]]
        }
        req_tl = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson_tl)
        resp_tl = get_aoi_analytics(req_tl)
        stat_tl = resp_tl.series[0]

        # Select AOI strictly in bottom-right
        geojson_br = {
            "type": "Polygon",
            "coordinates": [[[78.55, 17.45], [78.95, 17.45], [78.95, 17.05], [78.55, 17.05], [78.55, 17.45]]]
        }
        req_br = AOIAnalyticsRequest(result_ids=["res_wgs84"], geojson=geojson_br)
        resp_br = get_aoi_analytics(req_br)
        stat_br = resp_br.series[0]

        self.assertAlmostEqual(stat_tl.mean_ndvi, 0.8, places=2)
        self.assertAlmostEqual(stat_br.mean_ndvi, 0.2, places=2)
        self.assertNotEqual(stat_tl.mean_ndvi, stat_br.mean_ndvi)

if __name__ == "__main__":
    unittest.main()

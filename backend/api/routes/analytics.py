import os
import math
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from fastapi import APIRouter, HTTPException, status

try:
    import numpy as np
except ImportError:
    np = None

try:
    from osgeo import gdal, osr
except ImportError:
    try:
        import gdal
        import osr
    except ImportError:
        from gdal_compat import gdal
        osr = None

from api.job_manager import get_job_manager
from api.routes.filesystem import is_contained_in_root
from api.schemas import (
    PointAnalyticsRequest,
    PointAnalyticsResponse,
    PointValue,
    AOIAnalyticsRequest,
    AOIAnalyticsResponse,
    AOIStatsValue,
    ChangeDetectionRequest,
    ChangeDetectionResponse,
)
from mosaic_cpu.cpu_periodic_mosaic import get_date_from_filename

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _find_result_file(result_id: str) -> Tuple[Path, Dict[str, Any]]:
    manager = get_job_manager()
    with manager._lock:
        for job_id, job in manager._jobs.items():
            res_map = job.get("results_map", {})
            if result_id in res_map:
                res_data = res_map[result_id]
                abs_path = Path(res_data["absolute_path"]).resolve()
                out_dir = Path(job["output_directory"]).resolve()
                if is_contained_in_root(abs_path, out_dir) and abs_path.exists():
                    return abs_path, res_data
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Result ID '{result_id}' not found or unavailable."
    )


@router.post("/point", response_model=PointAnalyticsResponse)
def get_point_analytics(req: PointAnalyticsRequest):
    series: List[PointValue] = []

    for res_id in req.result_ids:
        file_path, res_data = _find_result_file(res_id)
        parsed_date = get_date_from_filename(res_data["filename"])
        date_str = parsed_date.strftime("%Y-%m-%d") if parsed_date else "Unknown"

        ds = gdal.Open(str(file_path), gdal.GA_ReadOnly)
        if ds is None:
            continue

        try:
            gt = ds.GetGeoTransform()
            inv_gt = gdal.InvGeoTransform(gt)
            if inv_gt is None:
                continue

            px, py = gdal.ApplyGeoTransform(inv_gt, req.lon, req.lat)
            col = int(px)
            row = int(py)

            if 0 <= col < ds.RasterXSize and 0 <= row < ds.RasterYSize:
                band = ds.GetRasterBand(1)
                nodata = band.GetNoDataValue()
                arr = band.ReadAsArray(col, row, 1, 1)
                if arr is not None and arr.size > 0:
                    val = float(arr[0, 0])
                    is_nodata = (nodata is not None and abs(val - nodata) < 1e-4) or (abs(val - -9999.0) < 1e-4) or math.isnan(val)
                    is_valid = not is_nodata and (-1.0 <= val <= 1.0)
                    series.append(PointValue(
                        result_id=res_id,
                        filename=res_data["filename"],
                        date=date_str,
                        ndvi=val if is_valid else -9999.0,
                        valid=is_valid,
                        nodata=is_nodata
                    ))
        finally:
            ds = None

    # Sort chronologically by date
    series.sort(key=lambda s: s.date)
    return PointAnalyticsResponse(lat=req.lat, lon=req.lon, series=series)


import pyproj
import rasterio
from rasterio.features import geometry_mask
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import transform

@router.post("/aoi", response_model=AOIAnalyticsResponse)
def get_aoi_analytics(req: AOIAnalyticsRequest):
    if not req.geojson:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AOI GeoJSON polygon is required.")

    # 1. Geometry Validation
    try:
        geom = shape(req.geojson)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid GeoJSON polygon geometry: {e}")

    if geom is None or geom.is_empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submitted AOI polygon geometry is empty.")

    if not geom.is_valid:
        geom = geom.buffer(0)

    if geom.is_empty or getattr(geom, "area", 0) <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submitted AOI polygon has zero area or invalid bounds.")

    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported geometry type '{geom.geom_type}'. Must be Polygon or MultiPolygon.")

    # Check distinct vertex count
    if geom.geom_type == "Polygon":
        ext_coords = list(geom.exterior.coords)
        distinct_coords = set(ext_coords)
        if len(distinct_coords) < 3 or len(ext_coords) < 4:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AOI polygon must contain at least 3 distinct vertices.")

    series: List[AOIStatsValue] = []

    for res_id in req.result_ids:
        file_path, res_data = _find_result_file(res_id)
        parsed_date = get_date_from_filename(res_data["filename"])
        date_str = parsed_date.strftime("%Y-%m-%d") if parsed_date else "Unknown"

        ds = gdal.Open(str(file_path), gdal.GA_ReadOnly)
        if ds is None:
            continue

        try:
            # 2. CRS extraction & transformation (EPSG:4326 -> raster CRS)
            proj_wkt = ds.GetProjection()
            if proj_wkt:
                try:
                    raster_crs = pyproj.CRS.from_wkt(proj_wkt)
                except Exception:
                    raster_crs = pyproj.CRS.from_epsg(4326)
            else:
                raster_crs = pyproj.CRS.from_epsg(4326)

            raster_crs_str = raster_crs.to_string() if raster_crs else "EPSG:4326"
            src_crs = pyproj.CRS.from_epsg(4326)

            if src_crs != raster_crs:
                try:
                    transformer = pyproj.Transformer.from_crs(src_crs, raster_crs, always_xy=True)
                    transformed_geom = transform(transformer.transform, geom)
                except Exception as tr_err:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to transform AOI polygon to raster CRS: {tr_err}")
            else:
                transformed_geom = geom

            if not transformed_geom.is_valid:
                transformed_geom = transformed_geom.buffer(0)

            if transformed_geom.is_empty or getattr(transformed_geom, "area", 0) <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transformed AOI polygon is empty or invalid in raster CRS.")

            # 3. Calculate bounding window in raster CRS
            min_x, min_y, max_x, max_y = transformed_geom.bounds
            gt = ds.GetGeoTransform()
            origin_x = gt[0]
            pixel_w = abs(gt[1])
            origin_y = gt[3]
            pixel_h = abs(gt[5])

            if pixel_w <= 0 or pixel_h <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid raster pixel resolution.")

            col1 = int(math.floor((min_x - origin_x) / pixel_w))
            col2 = int(math.ceil((max_x - origin_x) / pixel_w))
            row1 = int(math.floor((origin_y - max_y) / pixel_h))
            row2 = int(math.ceil((origin_y - min_y) / pixel_h))

            min_col = max(0, min(col1, col2))
            max_col = min(ds.RasterXSize - 1, max(col1, col2))
            min_row = max(0, min(row1, row2))
            max_row = min(ds.RasterYSize - 1, max(row1, row2))

            # 4. Check for raster overlap
            if min_col > max_col or min_row > max_row or min_col >= ds.RasterXSize or min_row >= ds.RasterYSize:
                series.append(AOIStatsValue(
                    result_id=res_id,
                    filename=res_data["filename"],
                    date=date_str,
                    valid_count=0,
                    nodata_count=0,
                    min_ndvi=-9999.0,
                    max_ndvi=-9999.0,
                    mean_ndvi=-9999.0,
                    median_ndvi=-9999.0,
                    std_dev=0.0,
                    valid_pixel_count=0,
                    nodata_pixel_count=0,
                    minimum=None,
                    maximum=None,
                    mean=None,
                    median=None,
                    standard_deviation=None,
                    raster_crs=raster_crs_str,
                    status="no_overlap",
                    message="The selected AOI does not overlap the raster."
                ))
                continue

            win_w = max_col - min_col + 1
            win_h = max_row - min_row + 1

            # Read only the raster window
            band = ds.GetRasterBand(1)
            arr = band.ReadAsArray(min_col, min_row, win_w, win_h).astype(np.float32)

            win_transform = rasterio.transform.Affine(
                pixel_w, 0.0, origin_x + min_col * pixel_w,
                0.0, -pixel_h, origin_y - min_row * pixel_h
            )

            # 5. Exact polygon rasterization mask (pixel-center inclusion rule)
            poly_mask = geometry_mask([transformed_geom], out_shape=(win_h, win_w), transform=win_transform, invert=True)

            poly_pixels = arr[poly_mask]
            if poly_pixels.size == 0:
                series.append(AOIStatsValue(
                    result_id=res_id,
                    filename=res_data["filename"],
                    date=date_str,
                    valid_count=0,
                    nodata_count=0,
                    min_ndvi=-9999.0,
                    max_ndvi=-9999.0,
                    mean_ndvi=-9999.0,
                    median_ndvi=-9999.0,
                    std_dev=0.0,
                    valid_pixel_count=0,
                    nodata_pixel_count=0,
                    minimum=None,
                    maximum=None,
                    mean=None,
                    median=None,
                    standard_deviation=None,
                    raster_crs=raster_crs_str,
                    status="no_overlap",
                    message="The selected AOI does not overlap the raster."
                ))
                continue

            # 6. Exclude nodata (-9999, raster nodata, NaN, +/-inf, out of range [-1.0, 1.0])
            raster_nodata = band.GetNoDataValue()

            is_finite = np.isfinite(poly_pixels)
            is_valid_range = (poly_pixels >= -1.0) & (poly_pixels <= 1.0)
            not_nodata9999 = np.abs(poly_pixels - -9999.0) > 1e-4

            if raster_nodata is not None:
                not_raster_nodata = np.abs(poly_pixels - raster_nodata) > 1e-4
                valid_mask = is_finite & is_valid_range & not_nodata9999 & not_raster_nodata
            else:
                valid_mask = is_finite & is_valid_range & not_nodata9999

            valid_pixels = poly_pixels[valid_mask]
            valid_cnt = int(valid_pixels.size)
            nodata_cnt = int(poly_pixels.size - valid_cnt)

            if valid_cnt == 0:
                series.append(AOIStatsValue(
                    result_id=res_id,
                    filename=res_data["filename"],
                    date=date_str,
                    valid_count=0,
                    nodata_count=nodata_cnt,
                    min_ndvi=-9999.0,
                    max_ndvi=-9999.0,
                    mean_ndvi=-9999.0,
                    median_ndvi=-9999.0,
                    std_dev=0.0,
                    valid_pixel_count=0,
                    nodata_pixel_count=nodata_cnt,
                    minimum=None,
                    maximum=None,
                    mean=None,
                    median=None,
                    standard_deviation=None,
                    raster_crs=raster_crs_str,
                    status="no_valid_pixels",
                    message="The selected AOI contains no valid NDVI pixels."
                ))
                continue

            min_v = float(np.min(valid_pixels))
            max_v = float(np.max(valid_pixels))
            mean_v = float(np.mean(valid_pixels))
            med_v = float(np.median(valid_pixels))
            std_v = float(np.std(valid_pixels))

            series.append(AOIStatsValue(
                result_id=res_id,
                filename=res_data["filename"],
                date=date_str,
                valid_count=valid_cnt,
                nodata_count=nodata_cnt,
                min_ndvi=round(min_v, 4),
                max_ndvi=round(max_v, 4),
                mean_ndvi=round(mean_v, 4),
                median_ndvi=round(med_v, 4),
                std_dev=round(std_v, 4),
                valid_pixel_count=valid_cnt,
                nodata_pixel_count=nodata_cnt,
                minimum=round(min_v, 4),
                maximum=round(max_v, 4),
                mean=round(mean_v, 4),
                median=round(med_v, 4),
                standard_deviation=round(std_v, 4),
                raster_crs=raster_crs_str,
                status="success",
                message="AOI analysis completed successfully."
            ))
        finally:
            ds = None

    series.sort(key=lambda s: s.date)
    return AOIAnalyticsResponse(series=series)


@router.post("/change", response_model=ChangeDetectionResponse)
def get_change_detection(req: ChangeDetectionRequest):
    f_early, data_early = _find_result_file(req.earlier_result_id)
    f_late, data_late = _find_result_file(req.later_result_id)

    ds_early = gdal.Open(str(f_early), gdal.GA_ReadOnly)
    ds_late = gdal.Open(str(f_late), gdal.GA_ReadOnly)

    if ds_early is None or ds_late is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not open input rasters.")

    try:
        arr_e = ds_early.GetRasterBand(1).ReadAsArray().astype(np.float32)
        arr_l = ds_late.GetRasterBand(1).ReadAsArray().astype(np.float32)

        if arr_e.shape != arr_l.shape:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Dimension mismatch between earlier {arr_e.shape} and later {arr_l.shape}.")

        valid_mask = (arr_e != -9999.0) & (arr_l != -9999.0) & (arr_e >= -1.0) & (arr_e <= 1.0) & (arr_l >= -1.0) & (arr_l <= 1.0)

        change_arr = np.full(arr_e.shape, -9999.0, dtype=np.float32)
        diff = arr_l - arr_e
        change_arr[valid_mask] = diff[valid_mask]

        valid_diff = diff[valid_mask]
        valid_cnt = int(valid_diff.size)
        nodata_cnt = int(change_arr.size - valid_cnt)

        tol = abs(req.tolerance)
        pos_cnt = int(np.sum(valid_diff > tol))
        neg_cnt = int(np.sum(valid_diff < -tol))
        neu_cnt = int(valid_cnt - pos_cnt - neg_cnt)

        if valid_cnt > 0:
            min_c = float(np.min(valid_diff))
            max_c = float(np.max(valid_diff))
            mean_c = float(np.mean(valid_diff))
        else:
            min_c = max_c = mean_c = 0.0

        return ChangeDetectionResponse(
            earlier_filename=data_early["filename"],
            later_filename=data_late["filename"],
            min_change=min_c,
            max_change=max_c,
            mean_change=mean_c,
            positive_count=pos_cnt,
            negative_count=neg_cnt,
            neutral_count=neu_cnt,
            valid_count=valid_cnt,
            nodata_count=nodata_cnt
        )
    finally:
        ds_early = None
        ds_late = None

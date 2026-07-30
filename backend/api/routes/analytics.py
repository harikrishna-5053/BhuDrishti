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
        gdal = None
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


def _find_result_file(result_id: str) -> Tuple_Path_Dict:
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


@router.post("/aoi", response_model=AOIAnalyticsResponse)
def get_aoi_analytics(req: AOIAnalyticsRequest):
    series: List[AOIStatsValue] = []

    for res_id in req.result_ids:
        file_path, res_data = _find_result_file(res_id)
        parsed_date = get_date_from_filename(res_data["filename"])
        date_str = parsed_date.strftime("%Y-%m-%d") if parsed_date else "Unknown"

        ds = gdal.Open(str(file_path), gdal.GA_ReadOnly)
        if ds is None:
            continue

        try:
            band = ds.GetRasterBand(1)
            arr = band.ReadAsArray()
            nodata = band.GetNoDataValue()

            if nodata is not None:
                valid_mask = (abs(arr - nodata) > 1e-4) & (abs(arr - -9999.0) > 1e-4) & (arr >= -1.0) & (arr <= 1.0)
            else:
                valid_mask = (abs(arr - -9999.0) > 1e-4) & (arr >= -1.0) & (arr <= 1.0)

            valid_vals = arr[valid_mask]
            valid_cnt = int(valid_vals.size)
            nodata_cnt = int(arr.size - valid_cnt)

            if valid_cnt > 0:
                min_v = float(np.min(valid_vals))
                max_v = float(np.max(valid_vals))
                mean_v = float(np.mean(valid_vals))
                med_v = float(np.median(valid_vals))
                std_v = float(np.std(valid_vals))
            else:
                min_v = max_v = mean_v = med_v = std_v = -9999.0

            series.append(AOIStatsValue(
                result_id=res_id,
                filename=res_data["filename"],
                date=date_str,
                valid_count=valid_cnt,
                nodata_count=nodata_cnt,
                min_ndvi=min_v,
                max_ndvi=max_v,
                mean_ndvi=mean_v,
                median_ndvi=med_v,
                std_dev=std_v
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

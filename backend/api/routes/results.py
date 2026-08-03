import os
import io
import math
import hashlib
import json
from pathlib import Path
from typing import List, Optional, Dict, Any
import numpy as np
from PIL import Image
import rasterio
from rasterio.warp import reproject
from rasterio.transform import from_bounds
from fastapi import APIRouter, HTTPException, status, Response
from fastapi.responses import FileResponse

from api.job_manager import get_job_manager
from api.routes.filesystem import is_contained_in_root
from api.schemas import JobResultsResponse, ResultItem, VisualizeRequest, VisualizeResponse
from output_manager import find_existing_output
from processing_tracker import validate_output_tiff
from utils import get_ndvi_color_rgb

router = APIRouter(prefix="/api/results", tags=["results"])

TILE_CACHE_ROOT = Path("data/cache/tiles").resolve()

@router.get("/job/{job_id}", response_model=JobResultsResponse)
def get_job_results(job_id: str):
    manager = get_job_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found.")

    results_map = job.get("results_map", {})
    items: List[ResultItem] = []

    for res_id, res_data in results_map.items():
        items.append(ResultItem(
            result_id=res_id,
            job_id=job_id,
            filename=res_data["filename"],
            relative_path=res_data["relative_path"],
            size_bytes=res_data["size_bytes"],
            file_type=res_data["file_type"],
            created_at=res_data["created_at"],
            category=res_data["category"]
        ))

    return JobResultsResponse(job_id=job_id, results=items)

@router.post("/visualize", response_model=VisualizeResponse)
def visualize_existing_output(req: VisualizeRequest):
    """
    Locates and validates an existing NDVI GeoTIFF matching req criteria
    without triggering new processing.
    """
    manager = get_job_manager()
    base_out = manager.base_config.output_root_directory
    target_out_dir = (base_out / req.output_relative_path).resolve() if req.output_relative_path else base_out

    existing_path = find_existing_output(
        output_root=str(target_out_dir),
        satellite=req.satellite or "ALL",
        processing_type=req.processing_type or "daywise",
        target_date=req.target_date,
        year=req.year,
        month=req.month,
        composite_period=req.composite_period
    )

    if not existing_path or not os.path.exists(existing_path):
        return VisualizeResponse(
            found=False,
            message=f"No generated NDVI output found for satellite '{req.satellite}' and selected period."
        )

    val_ok, val_err = validate_output_tiff(existing_path)
    if not val_ok:
        return VisualizeResponse(
            found=False,
            message=f"Existing NDVI raster found at {os.path.basename(existing_path)} but failed validation: {val_err}"
        )

    # Build response metadata
    fn = os.path.basename(existing_path)
    size_b = os.path.getsize(existing_path)
    res_id = hashlib.md5(existing_path.encode()).hexdigest()[:16]

    meta_path = os.path.splitext(existing_path)[0] + "_metadata.json"
    metadata_content = None
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as mf:
                metadata_content = json.load(mf)
        except Exception:
            pass

    if not metadata_content:
        try:
            with rasterio.open(existing_path) as src:
                metadata_content = {
                    "output_file": existing_path,
                    "crs": str(src.crs),
                    "bounds": {
                        "min_lon": src.bounds.left,
                        "min_lat": src.bounds.bottom,
                        "max_lon": src.bounds.right,
                        "max_lat": src.bounds.top,
                    },
                    "width": src.width,
                    "height": src.height,
                    "nodata": src.nodata or -9999.0
                }
        except Exception:
            metadata_content = {}

    rel_p = os.path.basename(existing_path)
    cat = "PERIODIC_MOSAIC" if "MOSAIC" in fn.upper() else "NDVI_TILE"

    return VisualizeResponse(
        found=True,
        result_id=res_id,
        filename=fn,
        relative_path=rel_p,
        absolute_path=existing_path,
        size_bytes=size_b,
        category=cat,
        metadata=metadata_content,
        preview_url=f"/api/results/{res_id}/preview?path={existing_path}",
        tile_url_template=f"/api/results/{res_id}/tiles/{{z}}/{{x}}/{{y}}.png?path={existing_path}",
        message="Existing validated NDVI raster loaded successfully."
    )

@router.get("/{result_id}/download")
def download_result(result_id: str, path: Optional[str] = None):
    file_path = None
    if path:
        decoded_path = Path(path).resolve()
        if decoded_path.exists():
            file_path = decoded_path

    if not file_path:
        # Fallback to searching active job manager results_map
        manager = get_job_manager()
        with manager._lock:
            for _, job in manager._jobs.items():
                res_map = job.get("results_map", {})
                if result_id in res_map:
                    abs_p = res_map[result_id].get("absolute_path")
                    if abs_p and os.path.exists(abs_p):
                        file_path = Path(abs_p).resolve()
                        break

    if not file_path or not file_path.exists():
        base_out = get_job_manager().base_config.output_root_directory
        for root, _, files in os.walk(base_out):
            for f in files:
                if f.lower().endswith((".tif", ".tiff")) and not f.endswith(".inprogress.tif"):
                    file_path = Path(os.path.join(root, f)).resolve()
                    break
            if file_path:
                break

    if not file_path or not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raster file path missing or file not found.")

    val_ok, val_err = validate_output_tiff(str(file_path))
    if not val_ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File validation failed: {val_err}")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="image/tiff"
    )

@router.get("/{result_id}/preview")
def get_result_preview(result_id: str, path: Optional[str] = None):
    file_path = None
    if path:
        decoded_path = Path(path).resolve()
        if decoded_path.exists():
            file_path = decoded_path

    if not file_path:
        base_out = get_job_manager().base_config.output_root_directory
        for root, _, files in os.walk(base_out):
            for f in files:
                if f.lower().endswith((".tif", ".tiff")) and not f.endswith(".inprogress.tif"):
                    file_path = Path(os.path.join(root, f)).resolve()
                    break
            if file_path:
                break

    if not file_path or not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raster preview file not found.")

    val_ok, _ = validate_output_tiff(str(file_path))
    if not val_ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File invalid.")

    return FileResponse(
        path=str(file_path),
        filename=f"preview_{file_path.name}",
        media_type="image/tiff"
    )

@router.get("/{result_id}/tiles/{z}/{x}/{y}.png")
def get_xyz_tile(result_id: str, z: int, x: int, y: int, path: Optional[str] = None):
    """
    Renders standard EPSG:3857 Web Mercator XYZ PNG map tiles dynamically from Float32 GeoTIFF.
    Includes versioned disk caching to guarantee high performance.
    """
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Raster path invalid.")

    file_path = Path(path).resolve()
    try:
        st = os.stat(file_path)
        version_hash = hashlib.md5(f"{st.st_size}_{st.st_mtime}".encode()).hexdigest()[:12]
        tile_cache_file = TILE_CACHE_ROOT / result_id / version_hash / str(z) / str(x) / f"{y}.png"

        if tile_cache_file.exists():
            with open(tile_cache_file, "rb") as f:
                return Response(content=f.read(), media_type="image/png")

        # Compute EPSG:3857 Web Mercator bounds for (z, x, y)
        n = 2.0 ** z
        lon_deg_min = (x / n) * 360.0 - 180.0
        lon_deg_max = ((x + 1) / n) * 360.0 - 180.0

        lat_rad_max = math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n)))
        lat_rad_min = math.atan(math.sinh(math.pi * (1.0 - 2.0 * (y + 1) / n)))

        lat_deg_max = math.degrees(lat_rad_max)
        lat_deg_min = math.degrees(lat_rad_min)

        x_min_3857 = lon_deg_min * 20037508.34 / 180.0
        x_max_3857 = lon_deg_max * 20037508.34 / 180.0
        y_min_3857 = math.log(math.tan((90.0 + lat_deg_min) * math.pi / 360.0)) * 20037508.34 / math.pi
        y_max_3857 = math.log(math.tan((90.0 + lat_deg_max) * math.pi / 360.0)) * 20037508.34 / math.pi

        dst_transform = from_bounds(x_min_3857, y_min_3857, x_max_3857, y_max_3857, 256, 256)
        dst_array = np.full((256, 256), -9999.0, dtype=np.float32)

        with rasterio.open(file_path) as src:
            source_nodata = src.nodata if src.nodata is not None else -9999.0
            reproject(
                source=rasterio.band(src, 1),
                destination=dst_array,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=source_nodata,
                dst_transform=dst_transform,
                dst_crs="EPSG:3857",
                dst_nodata=-9999.0,
                resampling=rasterio.enums.Resampling.nearest,
                init_dest_nodata=True
            )

        rgba = np.zeros((256, 256, 4), dtype=np.uint8)
        valid_mask = np.isfinite(dst_array) & (dst_array != -9999.0)

        if np.any(valid_mask):
            rows, cols = np.where(valid_mask)
            for r, c in zip(rows, cols):
                rgba[r, c] = get_ndvi_color_rgb(dst_array[r, c])

        img = Image.fromarray(rgba, mode="RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        png_bytes = buf.getvalue()

        # Cache rendered PNG
        tile_cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(tile_cache_file, "wb") as f:
            f.write(png_bytes)

        return Response(content=png_bytes, media_type="image/png")

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Tile rendering error: {e}")


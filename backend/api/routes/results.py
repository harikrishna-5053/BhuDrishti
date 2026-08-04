import os
import json
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status, Response
from fastapi.responses import FileResponse

from api.job_manager import get_job_manager
from api.schemas import JobResultsResponse, ResultItem, VisualizeRequest, VisualizeResponse
from output_manager import find_existing_output
from processing_tracker import validate_output_tiff
from result_registry import get_result_registry
from tile_engine import render_tile_png, render_preview_png

router = APIRouter(prefix="/api/results", tags=["results"])
logger = logging.getLogger(__name__)

TILE_CACHE_ROOT = Path("data/cache/tiles").resolve()
PREVIEW_CACHE_ROOT = Path("data/cache/previews").resolve()

@router.get("/job/{job_id}", response_model=JobResultsResponse)
def get_job_results(job_id: str):
    manager = get_job_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found.")

    registry = get_result_registry()
    results_map = job.get("results_map", {})
    items: List[ResultItem] = []

    for res_id, res_data in results_map.items():
        abs_p = res_data.get("absolute_path")
        if abs_p and os.path.exists(abs_p):
            registry.register_raster(abs_p, job_id=job_id)

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
    Locates and validates an existing NDVI GeoTIFF matching exact request criteria
    without triggering new processing. Registers result in ResultRegistry.
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
            message=f"No generated NDVI output found matching satellite '{req.satellite}' and selected parameters."
        )

    val_ok, val_err = validate_output_tiff(existing_path)
    if not val_ok:
        return VisualizeResponse(
            found=False,
            message=f"Existing NDVI raster found at {os.path.basename(existing_path)} but failed validation: {val_err}"
        )

    # Register in central authoritative registry
    registry = get_result_registry()
    rec = registry.register_raster(
        raster_path=existing_path,
        processing_type=req.processing_type,
        satellite=req.satellite,
        target_date=req.target_date,
        year=req.year,
        month=req.month,
        composite_period=req.composite_period
    )

    if not rec:
        return VisualizeResponse(found=False, message="Result path security verification failed.")

    res_id = rec["result_id"]
    fn = rec["filename"]

    return VisualizeResponse(
        found=True,
        result_id=res_id,
        filename=fn,
        relative_path=rec.get("relative_path", fn),
        absolute_path=existing_path,
        size_bytes=rec["size_bytes"],
        category=rec["category"],
        metadata=rec,
        preview_url=f"/api/results/{res_id}/preview",
        tile_url_template=f"/api/results/{res_id}/tiles/{{z}}/{{x}}/{{y}}.png",
        message="Existing validated NDVI raster loaded successfully."
    )

@router.get("/{result_id}")
def get_result_details(result_id: str):
    """Retrieves spatial bounds and metadata for a registered raster result."""
    registry = get_result_registry()
    rec = registry.get_result(result_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Result ID '{result_id}' not found.")
    return rec

@router.get("/{result_id}/download")
def download_result(result_id: str):
    registry = get_result_registry()
    rec = registry.get_result(result_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Result ID '{result_id}' not found.")

    file_path = Path(rec["absolute_path"])
    val_ok, val_err = validate_output_tiff(str(file_path))
    if not val_ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File validation failed: {val_err}")

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="image/tiff"
    )

@router.get("/{result_id}/preview")
def get_result_preview(result_id: str):
    registry = get_result_registry()
    rec = registry.get_result(result_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Result ID '{result_id}' not found.")

    file_path = rec["absolute_path"]
    cache_png = PREVIEW_CACHE_ROOT / f"{result_id}_{rec['version_hash']}.png"

    rendered = render_preview_png(file_path, cache_file=cache_png)
    if not rendered or not rendered.exists():
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to render preview PNG.")

    return FileResponse(
        path=str(rendered),
        filename=f"preview_{rec['filename']}.png",
        media_type="image/png"
    )

@router.get("/{result_id}/tiles/{z}/{x}/{y}.png")
def get_xyz_tile(result_id: str, z: int, x: int, y: int):
    """
    Renders standard EPSG:3857 Web Mercator XYZ PNG map tiles dynamically from Float32 GeoTIFF.
    Includes versioned disk caching to guarantee high performance.
    """
    registry = get_result_registry()
    rec = registry.get_result(result_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Result ID '{result_id}' not found.")

    file_path = rec["absolute_path"]
    version_hash = rec["version_hash"]

    tile_cache_dir = TILE_CACHE_ROOT / result_id
    tile_png = render_tile_png(
        raster_path=file_path,
        z=z,
        x=x,
        y=y,
        cache_dir=tile_cache_dir,
        version_hash=version_hash
    )

    if not tile_png or not tile_png.exists():
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Tile rendering failed.")

    return FileResponse(path=str(tile_png), media_type="image/png")


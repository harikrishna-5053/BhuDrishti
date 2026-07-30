import os
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from api.job_manager import get_job_manager
from api.schemas import JobResultsResponse, ResultItem

router = APIRouter(prefix="/api/jobs", tags=["results"])

@router.get("/{job_id}/results", response_model=JobResultsResponse)
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

@router.get("/{job_id}/results/{result_id}/download")
def download_job_result(job_id: str, result_id: str):
    manager = get_job_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found.")

    results_map = job.get("results_map", {})
    res_data = results_map.get(result_id)
    if not res_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Result '{result_id}' not found for job '{job_id}'.")

    file_path = Path(res_data["absolute_path"]).resolve()
    job_out_dir = Path(job["output_directory"]).resolve()

    # Enforce boundary ownership check
    if not str(file_path).startswith(str(job_out_dir)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to requested file location.")

    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output file missing on server filesystem.")

    return FileResponse(
        path=str(file_path),
        filename=res_data["filename"],
        media_type="image/tiff"
    )

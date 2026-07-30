from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from config import PipelineConfig
from api.job_manager import get_job_manager
from api.routes.filesystem import resolve_safe_path
from api.schemas import (
    CreateJobRequest,
    JobSummary,
    JobEventsResponse,
    JobEvent,
)

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

def format_job_summary(job: dict) -> JobSummary:
    return JobSummary(
        job_id=job["job_id"],
        status=job["status"],
        created_at=job["created_at"],
        started_at=job.get("started_at"),
        finished_at=job.get("finished_at"),
        input_directory=job.get("input_directory", ""),
        output_directory=job.get("output_directory", ""),
        current_stage=job.get("current_stage", "queued"),
        current=job.get("current", 0),
        total=job.get("total", 0),
        progress_percent=job.get("progress_percent"),
        indeterminate=job.get("indeterminate", True),
        current_zip=job.get("current_zip", ""),
        current_tile=job.get("current_tile", ""),
        message=job.get("message", ""),
    )

@router.post("", status_code=status.HTTP_202_ACCEPTED)
def submit_job(req: CreateJobRequest):
    manager = get_job_manager()
    cfg = PipelineConfig.from_env()

    # Validate input and output paths remain under root
    input_dir = resolve_safe_path(cfg.input_zip_directory, req.input_relative_path)
    output_dir = resolve_safe_path(cfg.output_root_directory, req.output_relative_path)

    if not input_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Selected input directory does not exist: '{req.input_relative_path}'"
        )

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not create output directory '{req.output_relative_path}': {e}"
        )

    # Check for active duplicate job
    active_dup = manager.find_active_duplicate(req.input_relative_path, req.output_relative_path)
    if active_dup:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active pipeline job ({active_dup}) is already running for the selected input/output locations."
        )

    create_mosaic_flag = req.create_mosaic if req.create_mosaic is not None else req.create_periodic_mosaic
    try:
        job_id = manager.create_job(
            input_rel=req.input_relative_path,
            output_rel=req.output_relative_path,
            create_periodic_mosaic=create_mosaic_flag
        )
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(val_err))

    return {"job_id": job_id, "status": "QUEUED"}

@router.get("", response_model=List[JobSummary])
def list_jobs(active_only: bool = Query(False, description="Filter active jobs only")):
    manager = get_job_manager()
    jobs = manager.list_jobs(active_only=active_only)
    return [format_job_summary(j) for j in jobs]

@router.get("/{job_id}")
def get_job_status(job_id: str):
    manager = get_job_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found.")

    res_summary = format_job_summary(job).model_dump()
    res_summary["error"] = job.get("error")
    res_summary["result"] = job.get("result")
    return res_summary

@router.get("/{job_id}/events", response_model=JobEventsResponse)
def get_job_events(
    job_id: str,
    after_sequence: int = Query(0, description="Return events with sequence > after_sequence")
):
    manager = get_job_manager()
    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found.")

    events_raw = job.get("events", [])
    filtered = [
        JobEvent(
            sequence=ev["sequence"],
            timestamp=ev["timestamp"],
            type=ev["type"],
            stage=ev["stage"],
            message=ev["message"],
            current=ev.get("current", 0),
            total=ev.get("total", 0),
            zip_name=ev.get("zip_name", ""),
            tile_id=ev.get("tile_id", "")
        )
        for ev in events_raw if ev["sequence"] > after_sequence
    ]

    latest_seq = job.get("sequence_counter", 0)
    return JobEventsResponse(
        job_id=job_id,
        events=filtered,
        latest_sequence=latest_seq
    )

@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    manager = get_job_manager()
    try:
        job = manager.cancel_job(job_id)
        return format_job_summary(job)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Job '{job_id}' not found.")

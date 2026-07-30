import os
import queue
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from config import PipelineConfig
from main import run_pipeline, PipelineResult
from api.schemas import JobSummary, JobEvent, ResultItem
from api.routes.filesystem import is_contained_in_root

class JobManager:
    """
    In-process single-worker job manager for BhuDrishti Sentinel-2 pipeline runs.
    Thread-safe queue with bounded event logs (max 2000) and bounded job history (max 100).
    """
    def __init__(self, base_config: Optional[PipelineConfig] = None):
        self.base_config = base_config or PipelineConfig.from_env()
        self._lock = threading.Lock()
        self._job_queue: queue.Queue = queue.Queue()
        self._jobs: Dict[str, dict] = {}
        self._job_order: List[str] = []
        self._worker_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.max_jobs_history = 100
        self.max_events_per_job = 2000

    def start(self):
        with self._lock:
            if self._worker_thread and self._worker_thread.is_alive():
                return
            self._stop_event.clear()
            self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name="BhuDrishtiPipelineWorker")
            self._worker_thread.start()
            print("BhuDrishti single-worker job pipeline manager started.")

    def stop(self):
        self._stop_event.set()
        # Unblock queue
        self._job_queue.put(None)
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=3.0)
        print("BhuDrishti job pipeline manager stopped cleanly.")

    def get_job(self, job_id: str) -> Optional[dict]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self, active_only: bool = False) -> List[dict]:
        with self._lock:
            jobs_list = [self._jobs[jid] for jid in self._job_order if jid in self._jobs]
            if active_only:
                jobs_list = [j for j in jobs_list if j["status"] in ("QUEUED", "RUNNING", "CANCELLING")]
            return jobs_list

    def find_active_duplicate(self, input_rel: str, output_rel: str) -> Optional[str]:
        with self._lock:
            for jid, job in self._jobs.items():
                if job["status"] in ("QUEUED", "RUNNING", "CANCELLING"):
                    if job["input_relative_path"] == input_rel and job["output_relative_path"] == output_rel:
                        return jid
            return None

    def create_job(self, input_rel: str, output_rel: str, create_periodic_mosaic: bool = True) -> str:
        with self._lock:
            # Enforce duplicate submission protection
            for jid, job in self._jobs.items():
                if job["status"] in ("QUEUED", "RUNNING", "CANCELLING"):
                    if job["input_relative_path"] == input_rel and job["output_relative_path"] == output_rel:
                        raise ValueError(f"An active job already exists for input '{input_rel}': {jid}")

            job_id = str(uuid.uuid4())
            now_iso = datetime.utcnow().isoformat() + "Z"
            cancel_event = threading.Event()

            job_data = {
                "job_id": job_id,
                "status": "QUEUED",
                "created_at": now_iso,
                "started_at": None,
                "finished_at": None,
                "input_relative_path": input_rel,
                "output_relative_path": output_rel,
                "create_periodic_mosaic": create_periodic_mosaic,
                "input_directory": "",
                "output_directory": "",
                "current_stage": "queued",
                "current": 0,
                "total": 0,
                "progress_percent": None,
                "indeterminate": True,
                "current_zip": "",
                "current_tile": "",
                "message": "Job queued in single-worker pipeline",
                "error": None,
                "result": None,
                "cancel_event": cancel_event,
                "events": [],
                "results_map": {}, # opaque_id -> result_dict
                "sequence_counter": 0,
            }

            self._jobs[job_id] = job_data
            self._job_order.append(job_id)
            self._prune_history_locked()

            self._job_queue.put(job_id)
            return job_id

    def cancel_job(self, job_id: str) -> dict:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                raise KeyError(f"Job '{job_id}' not found")

            status = job["status"]
            if status == "QUEUED":
                job["status"] = "CANCELLED"
                job["finished_at"] = datetime.utcnow().isoformat() + "Z"
                job["message"] = "Job cancelled before starting"
                job["cancel_event"].set()
                self._add_event_locked(job, "system", "cancellation", "Job cancelled before starting")
            elif status == "RUNNING":
                job["status"] = "CANCELLING"
                job["message"] = "Cancellation requested..."
                job["cancel_event"].set()
                self._add_event_locked(job, "system", "cancellation", "Cancellation requested by user")

            return job

    def _prune_history_locked(self):
        while len(self._job_order) > self.max_jobs_history:
            oldest_id = self._job_order[0]
            oldest_job = self._jobs.get(oldest_id)
            # Never prune active or queued jobs
            if oldest_job and oldest_job["status"] in ("QUEUED", "RUNNING", "CANCELLING"):
                break
            self._job_order.pop(0)
            self._jobs.pop(oldest_id, None)

    def _add_event_locked(self, job: dict, ev_type: str, stage: str, message: str, current: int = 0, total: int = 0, zip_name: str = "", tile_id: str = ""):
        if job["status"] in ("SUCCEEDED", "FAILED", "CANCELLED") and ev_type != "system":
            return

        job["sequence_counter"] += 1
        seq = job["sequence_counter"]
        event = {
            "sequence": seq,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": ev_type,
            "stage": stage,
            "message": message,
            "current": current,
            "total": total,
            "zip_name": zip_name,
            "tile_id": tile_id,
        }
        job["events"].append(event)
        if len(job["events"]) > self.max_events_per_job:
            job["events"].pop(0)

    def _worker_loop(self):
        while not self._stop_event.is_set():
            try:
                job_id = self._job_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            if job_id is None:
                break

            self._execute_job(job_id)
            self._job_queue.task_done()

    def _execute_job(self, job_id: str):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job or job["status"] == "CANCELLED":
                return

            job["status"] = "RUNNING"
            job["started_at"] = datetime.utcnow().isoformat() + "Z"
            job["message"] = "Pipeline execution started"
            self._add_event_locked(job, "system", "started", "Pipeline execution started")

            # Resolve paths cleanly from base config
            base_in = self.base_config.input_zip_directory
            base_out = self.base_config.output_root_directory

            in_rel = job["input_relative_path"]
            out_rel = job["output_relative_path"]

            job_in_dir = (base_in / in_rel).resolve() if in_rel else base_in
            job_out_dir = (base_out / out_rel).resolve() if out_rel else base_out

            job["input_directory"] = str(job_in_dir)
            job["output_directory"] = str(job_out_dir)

            config = PipelineConfig(
                input_zip_directory=job_in_dir,
                output_root_directory=job_out_dir,
                india_shapefile_path=self.base_config.india_shapefile_path,
                temporary_directory=self.base_config.temporary_directory / job_id,
                processed_files_log=job_out_dir / "logs" / "processing_records.jsonl",
                skipped_files_log=job_out_dir / "logs" / "skipped_files.txt",
                processing_mode=self.base_config.processing_mode,
                create_periodic_mosaic=job["create_periodic_mosaic"],
                mosaic_method=self.base_config.mosaic_method,
                block_size=self.base_config.block_size,
                nodata_value=self.base_config.nodata_value
            )
            cancel_event = job["cancel_event"]

        def progress_cb(info: Dict[str, Any]):
            with self._lock:
                if job["status"] in ("SUCCEEDED", "PARTIAL_SUCCESS", "FAILED", "CANCELLED"):
                    return

                stage = info.get("stage", "processing")
                curr = info.get("current", 0)
                tot = info.get("total", 0)
                zname = info.get("zip_name", "")
                tid = info.get("tile_id", "")
                msg = info.get("message", f"Processing {stage}")

                job["current_stage"] = stage
                job["current"] = curr
                job["total"] = tot
                job["current_zip"] = zname
                job["current_tile"] = tid
                job["message"] = msg

                if tot > 0:
                    pct = round((curr / tot) * 100, 1)
                    job["progress_percent"] = min(100.0, max(0.0, pct))
                    job["indeterminate"] = False
                else:
                    job["progress_percent"] = None
                    job["indeterminate"] = True

                self._add_event_locked(job, "progress", stage, msg, curr, tot, zname, tid)

        def log_cb(level: str, msg: str):
            with self._lock:
                if job["status"] in ("SUCCEEDED", "PARTIAL_SUCCESS", "FAILED", "CANCELLED"):
                    return
                self._add_event_locked(job, "log", job["current_stage"], f"[{level}] {msg}")

        # Run pipeline
        try:
            pipeline_res: PipelineResult = run_pipeline(
                config=config,
                progress_callback=progress_cb,
                log_callback=log_cb,
                cancel_event=cancel_event
            )
            with self._lock:
                job["finished_at"] = datetime.utcnow().isoformat() + "Z"

                # Determine terminal job status cleanly
                if cancel_event.is_set() or pipeline_res.cancelled:
                    job["status"] = "CANCELLED"
                    job["message"] = "Processing cancelled."
                    self._add_event_locked(job, "system", "cancelled", "Processing cancelled.")
                elif pipeline_res.failed_zip_files > 0 and len(pipeline_res.output_files) > 0:
                    job["status"] = "PARTIAL_SUCCESS"
                    job["message"] = f"Processing completed with some failures: {len(pipeline_res.output_files)} output(s) created, {pipeline_res.failed_zip_files} ZIP(s) failed."
                    self._add_event_locked(job, "system", "completed_partial", job["message"])
                elif pipeline_res.failed_zip_files > 0 and len(pipeline_res.output_files) == 0 and pipeline_res.total_zip_files > 0:
                    job["status"] = "FAILED"
                    job["message"] = f"Processing failed: all {pipeline_res.failed_zip_files} processable ZIP(s) failed."
                    self._add_event_locked(job, "system", "failed", job["message"])
                else:
                    job["status"] = "SUCCEEDED"
                    job["message"] = f"Processing completed successfully. Created {len(pipeline_res.output_files)} output file(s)."
                    self._add_event_locked(job, "system", "completed", job["message"])

                job["result"] = {
                    "total_zip_files": pipeline_res.total_zip_files,
                    "already_processed": pipeline_res.already_processed,
                    "processed_zip_files": pipeline_res.processed_zip_files,
                    "skipped_outside_india": pipeline_res.skipped_outside_india,
                    "failed_zip_files": pipeline_res.failed_zip_files,
                    "ndvi_outputs_created": pipeline_res.ndvi_outputs_created,
                    "mosaic_outputs_created": pipeline_res.mosaic_outputs_created,
                    "elapsed_seconds": pipeline_res.elapsed_seconds,
                }

                # Create opaque result mappings from verified pipeline output files
                for out_file in pipeline_res.output_files:
                    p_file = Path(out_file).resolve()
                    if not p_file.exists() or not p_file.is_file():
                        continue

                    # Verify file remains inside job output directory
                    if not is_contained_in_root(p_file, job_out_dir):
                        continue

                    res_id = str(uuid.uuid4())
                    fn = p_file.name
                    cat = "PERIODIC_MOSAIC" if "MOSAIC" in fn.upper() else "NDVI_TILE"
                    size_b = p_file.stat().st_size
                    try:
                        rel_p = str(p_file.relative_to(job_out_dir)).replace("\\", "/")
                    except ValueError:
                        rel_p = fn

                    res_item = {
                        "result_id": res_id,
                        "job_id": job_id,
                        "filename": fn,
                        "absolute_path": str(p_file),
                        "relative_path": rel_p,
                        "size_bytes": size_b,
                        "file_type": "image/tiff",
                        "created_at": datetime.utcnow().isoformat() + "Z",
                        "category": cat
                    }
                    job["results_map"][res_id] = res_item

                    self._add_event_locked(job, "system", "completed", job["message"])

        except Exception as err:
            with self._lock:
                job["finished_at"] = datetime.utcnow().isoformat() + "Z"
                job["status"] = "FAILED"
                job["error"] = str(err)
                job["message"] = f"Pipeline execution failed: {err}"
                self._add_event_locked(job, "system", "failed", f"Pipeline execution failed: {err}")

# Singleton instance
_global_job_manager: Optional[JobManager] = None

def get_job_manager() -> JobManager:
    global _global_job_manager
    if _global_job_manager is None:
        _global_job_manager = JobManager()
    return _global_job_manager

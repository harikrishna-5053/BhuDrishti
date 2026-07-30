from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

class HealthResponse(BaseModel):
    status: str = "ok"
    application: str = "BhuDrishti Backend"
    mode: str = "local"
    pipeline_integration: str = "available"

class RootLocation(BaseModel):
    path: str
    exists: bool

class RootsResponse(BaseModel):
    input: RootLocation
    output: RootLocation

class DirectoryItem(BaseModel):
    name: str
    relative_path: str

class DirectoriesResponse(BaseModel):
    scope: str
    current_relative_path: str
    parent_relative_path: Optional[str] = None
    directories: List[DirectoryItem]

class CreateDirectoryRequest(BaseModel):
    scope: str
    parent_relative_path: str = ""
    directory_name: str

class CreateJobRequest(BaseModel):
    input_relative_path: str = ""
    output_relative_path: str = ""
    create_periodic_mosaic: bool = True

class JobSummary(BaseModel):
    job_id: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    input_directory: str
    output_directory: str
    current_stage: str
    current: int = 0
    total: int = 0
    progress_percent: Optional[float] = None
    indeterminate: bool = True
    current_zip: str = ""
    current_tile: str = ""
    message: str = ""

class JobEvent(BaseModel):
    sequence: int
    timestamp: str
    type: str
    stage: str
    message: str
    current: int = 0
    total: int = 0
    zip_name: str = ""
    tile_id: str = ""

class JobEventsResponse(BaseModel):
    job_id: str
    events: List[JobEvent]
    latest_sequence: int

class ResultItem(BaseModel):
    result_id: str
    job_id: str
    filename: str
    relative_path: str
    size_bytes: int
    file_type: str
    created_at: str
    category: str  # NDVI_TILE, PERIODIC_MOSAIC, OTHER

class JobResultsResponse(BaseModel):
    job_id: str
    results: List[ResultItem]

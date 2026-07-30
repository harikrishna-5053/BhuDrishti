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

class PointAnalyticsRequest(BaseModel):
    result_ids: List[str]
    lat: float
    lon: float

class PointValue(BaseModel):
    result_id: str
    filename: str
    date: str
    ndvi: float
    valid: bool
    nodata: bool

class PointAnalyticsResponse(BaseModel):
    lat: float
    lon: float
    series: List[PointValue]

class AOIAnalyticsRequest(BaseModel):
    result_ids: List[str]
    geojson: Dict[str, Any]

class AOIStatsValue(BaseModel):
    result_id: str
    filename: str
    date: str
    valid_count: int
    nodata_count: int
    min_ndvi: float
    max_ndvi: float
    mean_ndvi: float
    median_ndvi: float
    std_dev: float

class AOIAnalyticsResponse(BaseModel):
    series: List[AOIStatsValue]

class ChangeDetectionRequest(BaseModel):
    earlier_result_id: str
    later_result_id: str
    tolerance: float = 0.02

class ChangeDetectionResponse(BaseModel):
    earlier_filename: str
    later_filename: str
    min_change: float
    max_change: float
    mean_change: float
    positive_count: int
    negative_count: int
    neutral_count: int
    valid_count: int
    nodata_count: int
    change_result_id: Optional[str] = None

class JobResultsResponse(BaseModel):
    job_id: str
    results: List[ResultItem]

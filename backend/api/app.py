import os
import sys
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Add backend directory to sys.path if missing
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from api.schemas import HealthResponse, StructuredErrorResponse
from api.job_manager import get_job_manager
from api.routes.filesystem import router as filesystem_router
from api.routes.jobs import router as jobs_router
from api.routes.results import router as results_router
from api.routes.analytics import router as analytics_router

logger = logging.getLogger("bhudrishti.startup")

def validate_startup_config():
    """
    Validates essential environment configuration, root paths, and raster libraries on backend startup.
    """
    manager = get_job_manager()
    in_root = manager.base_config.input_zip_directory
    out_root = manager.base_config.output_root_directory
    cache_dir = Path("data/cache/tiles").resolve()
    temp_dir = Path("data/temp").resolve()

    # Ensure directories exist and are writable
    for d_name, d_path in [("Input Root", in_root), ("Output Root", out_root), ("Tile Cache", cache_dir), ("Temp Dir", temp_dir)]:
        try:
            d_path.mkdir(parents=True, exist_ok=True)
            test_file = d_path / ".write_test"
            test_file.write_text("test")
            test_file.unlink()
        except Exception as e:
            logger.error(f"Startup validation failed for {d_name} at '{d_path}': {e}")
            raise RuntimeError(f"Startup check failed: {d_name} at '{d_path}' is not writable. Details: {e}")

    # Check raster libraries (Rasterio/GDAL)
    try:
        import rasterio
        with rasterio.Env() as env:
            drivers = env.drivers()
            if "GTiff" not in drivers:
                logger.warning("GTiff driver not reported in Rasterio drivers dictionary.")
    except Exception as e:
        logger.error(f"Rasterio runtime validation failed: {e}")
        raise RuntimeError(f"Rasterio library startup check failed: {e}")

    logger.info("Startup configuration validation successful.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lifespan startup: Validate config & start single-worker job manager
    validate_startup_config()
    manager = get_job_manager()
    manager.start()
    print("BhuDrishti backend listening at http://127.0.0.1:8000")
    yield
    # Lifespan shutdown: stop worker cleanly
    manager.stop()

app = FastAPI(
    title="BhuDrishti Backend API",
    description="Local Python Sentinel-2 NDVI processing pipeline API",
    version="2.0.0",
    lifespan=lifespan
)

# Exception handlers for structured error responses
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    user_msg = str(detail) if isinstance(detail, (str, int, float)) else "An error occurred."
    tech_msg = str(detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=StructuredErrorResponse(
            success=False,
            error_code=f"HTTP_{exc.status_code}",
            user_message=user_msg,
            technical_message=tech_msg,
            recoverable=exc.status_code < 500,
            details={"path": str(request.url)}
        ).model_dump()
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled backend exception at {request.url}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=StructuredErrorResponse(
            success=False,
            error_code="INTERNAL_SERVER_ERROR",
            user_message="An internal backend error occurred while processing your request.",
            technical_message=str(exc),
            recoverable=False,
            details={"path": str(request.url)}
        ).model_dump()
    )

# Configure CORS for local development origins
allowed_origins_env = os.environ.get("BHUDRISHTI_ALLOWED_ORIGINS", "")
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health endpoint
@app.get("/api/health", response_model=HealthResponse, tags=["health"])
def get_health():
    return HealthResponse(
        status="ok",
        application="BhuDrishti Backend",
        mode="local",
        pipeline_integration="available"
    )

# Include Routers
app.include_router(filesystem_router)
app.include_router(jobs_router)
app.include_router(results_router)
app.include_router(analytics_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.app:app", host="127.0.0.1", port=8000, workers=1)

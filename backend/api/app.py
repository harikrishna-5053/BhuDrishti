import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add backend directory to sys.path if missing
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from api.schemas import HealthResponse
from api.job_manager import get_job_manager
from api.routes.filesystem import router as filesystem_router
from api.routes.jobs import router as jobs_router
from api.routes.results import router as results_router
from api.routes.analytics import router as analytics_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lifespan startup: start single-worker queue cleanly
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

# Health endpoint (Zero processing side-effects)
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

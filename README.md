# BhuDrishti — Sentinel-2 L2A NDVI Processing & Analytics Platform

**BhuDrishti** is a local Python and React GIS application designed for processing Sentinel-2 L2A satellite archives, computing Normalized Difference Vegetation Index (NDVI) rasters with Scene Classification Layer (SCL) cloud/shadow masking, generating periodic maximum-NDVI composites, and providing time-series analytics, point sampling, AOI statistics, and NDVI change detection.

---

## Key Features

- **Automated Sentinel-2 Processing**: Discovers `B04` (10m Red), `B08` (10m NIR), and `SCL` (20m Scene Classification) bands from SAFE format ZIP archives.
- **SCL Masking**: Excludes cloud, shadow, saturated, and invalid pixels (`SCL classes {0, 1, 2, 3, 8, 9, 10}`) while preserving valid vegetation, soil, water, and snow pixels (`{4, 5, 6, 7, 11}`).
- **Geometric Reprojection & Alignment**: Standardizes canvas to **EPSG:4326** with `0.0001` degree resolution (~10m) using memory-bounded blockwise processing (`2048x2048`).
- **Periodic Maximum Value Compositing (MVC)**: Groups Sentinel-2 acquisitions by 10-day period buckets (`01_10`, `11_20`, `21_END`), merging overlapping MGRS tiles into a single periodic composite GeoTIFF.
- **Standalone & Connected Frontend**: Operates as a local GeoTIFF viewer (client-side rendering) or connected to the FastAPI backend service for job execution, live progress streaming, and results history.
- **Advanced Raster Analytics**:
  - Point NDVI sampling across multiple acquisition dates.
  - AOI (Area of Interest) polygon statistics (min, max, mean, median, std dev, valid/nodata pixel counts).
  - Multi-date NDVI change detection ($\Delta \text{NDVI} = \text{NDVI}_{\text{later}} - \text{NDVI}_{\text{earlier}}$) with neutral tolerance bands.
- **Air-Gapped / Offline Support**: Uses system font fallbacks and degrades gracefully to grid lines when internet basemap tile servers are unreachable.

---

## System Requirements

- **Python**: 3.10 or 3.14 (with GDAL, NumPy, FastAPI, PyProj)
- **Node.js**: v18+ (for frontend)
- **Operating Systems**: Windows 10/11, Linux, macOS (CPU mode)
- **GPU Acceleration**: Optional (NVIDIA GPU with CUDA and CuPy)

---

## Installation & Setup

### 1. Conda Environment Setup
```bash
conda env create -f environment.yml
conda activate bhudrishti
```

### 2. Backend Setup
```bash
cd backend
pip install -r requirements.txt
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```

---

## Running BhuDrishti

### Option A: Using Startup Scripts
- **Windows (PowerShell)**:
  ```powershell
  .\scripts\start_backend.ps1
  .\scripts\start_frontend.ps1
  ```
- **Linux / macOS**:
  ```bash
  ./scripts/start_backend.sh
  ./scripts/start_frontend.sh
  ```

### Option B: Manual Execution
- **Backend Server**:
  ```bash
  python -m uvicorn api.app:app --host 127.0.0.1 --port 8000 --workers 1
  ```
- **Frontend App**:
  ```bash
  cd frontend
  npm run dev
  ```

Access the application in your browser at `http://localhost:8080` or `http://localhost:5173`.

---

## Project Architecture

```text
BhuDrishti/
├── backend/
│   ├── api/                # FastAPI application, job manager, and routes
│   │   ├── routes/         # Filesystem, Jobs, Results, Analytics endpoints
│   │   ├── app.py          # FastAPI app entry point
│   │   ├── job_manager.py  # Single-worker processing job queue
│   │   └── schemas.py      # Pydantic request & response models
│   ├── mosaic_cpu/         # CPU reprojection, alignment, and MVC mosaic engine
│   ├── main.py             # CLI & pipeline runner entrypoint
│   ├── config.py           # Pipeline configuration loader
│   ├── ndvi_processing.py  # Blockwise CPU NDVI computation & SCL masking
│   ├── ndvi_gen.py         # GPU CuPy NDVI calculation module
│   └── processing_tracker.py # Thread-safe JSONL run tracker
├── frontend/               # React, TanStack, Leaflet, TailwindCSS UI
│   ├── src/                # Components, routes, stores, geotiff parser
│   └── vite.config.ts      # Vite configuration
├── scripts/                # Cross-platform startup scripts
├── environment.yml         # Portable Conda environment configuration
└── .env.example            # Environment configuration template
```

---

## Scientific Nodata & Masking Rules

- **Nodata Value**: `-9999.0`
- **NDVI Range**: `[-1.0, 1.0]`
- **SCL Invalid Classes**: `0` (No Data), `1` (Saturated/Defective), `2` (Dark Area / Cast Shadows), `3` (Cloud Shadows), `8` (Cloud Med Prob), `9` (Cloud High Prob), `10` (Thin Cirrus)
- **SCL Valid Classes**: `4` (Vegetation), `5` (Bare Soils), `6` (Water), `7` (Unclassified), `11` (Snow/Ice)

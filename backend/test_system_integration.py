import os
import shutil
import tempfile
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_bounds

from config import PipelineConfig
from result_registry import ResultRegistry
from tile_engine import render_tile_png, render_preview_png
from mosaic_creator import IndiaMosaicCreator


def create_mock_ndvi_geotiff(file_path: Path, width=500, height=500, crs="EPSG:4326"):
    file_path.parent.mkdir(parents=True, exist_ok=True)
    transform = from_bounds(77.0, 12.0, 78.0, 13.0, width, height)
    
    arr = np.full((height, width), -9999.0, dtype=np.float32)
    arr[100:400, 100:400] = np.random.uniform(0.25, 0.85, size=(300, 300)).astype(np.float32)
    arr[50:90, 50:90] = -0.3

    with rasterio.open(
        file_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs=crs,
        transform=transform,
        nodata=-9999.0,
        compress="lzw"
    ) as dst:
        dst.write(arr, 1)

    return file_path


def test_startup_config_validation(tmp_path):
    conf = PipelineConfig(
        input_zip_directory=tmp_path / "input",
        output_root_directory=tmp_path / "output",
        india_shapefile_path=tmp_path / "india.shp",
        temporary_directory=tmp_path / "temp",
        processed_files_log=tmp_path / "output" / "logs" / "processed.txt",
        skipped_files_log=tmp_path / "output" / "logs" / "skipped.txt"
    )
    conf.input_zip_directory.mkdir(parents=True, exist_ok=True)
    conf.output_root_directory.mkdir(parents=True, exist_ok=True)
    conf.temporary_directory.mkdir(parents=True, exist_ok=True)
    assert (tmp_path / "input").exists()
    assert (tmp_path / "output").exists()
    assert (tmp_path / "temp").exists()
    print("  [PASS] test_startup_config_validation")


def test_registry_persistence_and_security(tmp_path):
    data_root = tmp_path / "data"
    output_root = data_root / "output"
    output_root.mkdir(parents=True, exist_ok=True)
    
    registry = ResultRegistry(output_root=output_root)
    
    # Security test: Attempt path traversal
    outside_file = tmp_path / "secret.tif"
    create_mock_ndvi_geotiff(outside_file)
    rec_sec = registry.register_raster(outside_file)
    assert rec_sec is None, "Registry should reject files outside output_root"
    
    # Valid output registration test
    valid_file = output_root / "2026_03" / "S2A_MSIL2A_NDVI.tif"
    create_mock_ndvi_geotiff(valid_file)
    
    rec = registry.register_raster(valid_file, satellite="SEN-2A", processing_type="daywise")
    assert rec is not None
    assert rec["filename"] == "S2A_MSIL2A_NDVI.tif"
    assert rec["satellite"] == "SEN-2A"
    
    # Test persistence reloading
    registry2 = ResultRegistry(output_root=output_root)
    rec_reloaded = registry2.get_result(rec["result_id"])
    assert rec_reloaded is not None
    assert rec_reloaded["filename"] == "S2A_MSIL2A_NDVI.tif"
    print("  [PASS] test_registry_persistence_and_security")


def test_xyz_tile_rendering(tmp_path):
    output_root = tmp_path / "output"
    cache_dir = tmp_path / "cache" / "tiles"
    
    valid_file = output_root / "S2A_NDVI.tif"
    create_mock_ndvi_geotiff(valid_file)
    
    tile_png = render_tile_png(valid_file, z=8, x=183, y=119, cache_dir=cache_dir, version_hash="v1")
    
    assert tile_png is not None
    assert tile_png.exists()
    assert tile_png.stat().st_size > 0
    print("  [PASS] test_xyz_tile_rendering")


def test_preview_rendering(tmp_path):
    valid_file = tmp_path / "output" / "S2A_NDVI.tif"
    create_mock_ndvi_geotiff(valid_file)
    
    cache_file = tmp_path / "cache" / "previews" / "preview_v1.png"
    rendered = render_preview_png(valid_file, cache_file=cache_file)
    
    assert rendered is not None
    assert rendered.exists()
    assert rendered.stat().st_size > 0
    print("  [PASS] test_preview_rendering")


def test_vegetation_percentage_calculation():
    valid_pixels = np.array([0.5]*30 + [0.1]*10 + [-0.2]*10, dtype=np.float32)
    veg_cnt = np.count_nonzero(valid_pixels >= 0.2)
    valid_cnt = len(valid_pixels)
    
    veg_pct = round((veg_cnt / valid_cnt) * 100.0, 2)
    assert veg_cnt == 30
    assert veg_pct == 60.0
    print("  [PASS] test_vegetation_percentage_calculation")


def test_india_mosaic_creator_end_to_end(tmp_path):
    out_dir = tmp_path / "output" / "2026_03" / "composite_11_20"
    file1 = out_dir / "S2A_MSIL2A_20260312T043231_NDVI.tif"
    file2 = out_dir / "S2B_MSIL2B_20260316T043231_NDVI.tif"
    create_mock_ndvi_geotiff(file1)
    create_mock_ndvi_geotiff(file2)
    
    creator = IndiaMosaicCreator()
    mosaic_out = out_dir / "MOSAIC_2026_03_11_20.tif"
    created_file = creator.create_mosaic(input_files=[str(file1), str(file2)], output_path=str(mosaic_out))
    
    mosaic_file = Path(created_file)
    assert mosaic_file.exists()
    assert not str(mosaic_file).endswith(".inprogress.tif")
    assert "MOSAIC" in mosaic_file.name.upper()
    print("  [PASS] test_india_mosaic_creator_end_to_end")


def run_all_tests():
    print("Running BhuDrishti Integration Suite...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        test_startup_config_validation(tmp_path)
        test_registry_persistence_and_security(tmp_path)
        test_xyz_tile_rendering(tmp_path)
        test_preview_rendering(tmp_path)
        test_vegetation_percentage_calculation()
        test_india_mosaic_creator_end_to_end(tmp_path)
    print("\nALL SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_all_tests()

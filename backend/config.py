import os
from dataclasses import dataclass, field
from pathlib import Path

class ConfigurationError(Exception):
    """Custom exception raised for invalid BhuDrishti pipeline configurations."""
    pass

@dataclass
class PipelineConfig:
    input_zip_directory: Path
    output_root_directory: Path
    india_shapefile_path: Path
    temporary_directory: Path
    processed_files_log: Path
    skipped_files_log: Path
    processing_mode: str = "cpu"
    create_periodic_mosaic: bool = True
    mosaic_method: str = "maximum"
    block_size: int = 2048
    nodata_value: float = -9999.0

    @classmethod
    def from_env(cls, repo_root: Path | None = None) -> "PipelineConfig":
        if repo_root is None:
            # Assume backend parent directory as repository root
            repo_root = Path(__file__).resolve().parent.parent

        backend_dir = repo_root / "backend"
        data_dir = repo_root / "data"

        input_dir = Path(os.environ.get("BHUDRISHTI_INPUT_DIR", data_dir / "input_zips"))
        output_dir = Path(os.environ.get("BHUDRISHTI_OUTPUT_DIR", data_dir / "output"))
        shapefile = Path(os.environ.get("BHUDRISHTI_INDIA_SHAPEFILE", repo_root / "India_Shape_File" / "India_fixed.shp"))
        temp_dir = Path(os.environ.get("BHUDRISHTI_TEMP_DIR", data_dir / "temp"))
        processing_mode = os.environ.get("BHUDRISHTI_PROCESSING_MODE", "cpu").lower()

        logs_dir = output_dir / "logs"
        processed_log = logs_dir / "processing_records.jsonl"
        skipped_log = logs_dir / "skipped_files.txt"

        return cls(
            input_zip_directory=input_dir,
            output_root_directory=output_dir,
            india_shapefile_path=shapefile,
            temporary_directory=temp_dir,
            processed_files_log=processed_log,
            skipped_files_log=skipped_log,
            processing_mode=processing_mode,
            create_periodic_mosaic=True,
            mosaic_method="maximum",
            block_size=2048,
            nodata_value=-9999.0,
        )

    def validate(self) -> None:
        """
        Validates pipeline paths and configuration options.
        Must be called explicitly at execution time (NOT on import).
        """
        if not self.input_zip_directory.exists():
            raise ConfigurationError(
                f"Configuration error: Input ZIP directory was not found at '{self.input_zip_directory.resolve()}'"
            )
        if not self.input_zip_directory.is_dir():
            raise ConfigurationError(
                f"Configuration error: Input ZIP path '{self.input_zip_directory.resolve()}' is not a directory"
            )

        if not self.india_shapefile_path.exists():
            raise ConfigurationError(
                f"Configuration error: India shapefile was not found at '{self.india_shapefile_path.resolve()}'"
            )
        if self.india_shapefile_path.suffix.lower() != ".shp":
            raise ConfigurationError(
                f"Configuration error: India shapefile '{self.india_shapefile_path.name}' must have a .shp extension"
            )

        try:
            self.output_root_directory.mkdir(parents=True, exist_ok=True)
            (self.output_root_directory / "logs").mkdir(parents=True, exist_ok=True)
        except Exception as e:
            raise ConfigurationError(
                f"Configuration error: Could not create output directory at '{self.output_root_directory.resolve()}': {e}"
            )

        if self.processing_mode not in ("cpu", "gpu"):
            raise ConfigurationError(
                f"Configuration error: Processing mode must be 'cpu' or 'gpu', got '{self.processing_mode}'"
            )

        if not isinstance(self.block_size, int) or self.block_size <= 0:
            raise ConfigurationError(
                f"Configuration error: Block size must be a positive integer, got '{self.block_size}'"
            )

        if not isinstance(self.nodata_value, (int, float)):
            raise ConfigurationError(
                f"Configuration error: Nodata value must be numeric, got '{self.nodata_value}'"
            )

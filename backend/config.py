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

        env_input = os.environ.get("BHUDRISHTI_INPUT_DIR") or os.environ.get("INPUT_ZIP_DIRECTORY")
        input_dir = Path(env_input) if env_input else data_dir / "input_zips"

        env_output = os.environ.get("BHUDRISHTI_OUTPUT_DIR") or os.environ.get("OUTPUT_ROOT_DIRECTORY")
        output_dir = Path(env_output) if env_output else data_dir / "output"

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

    @classmethod
    def from_args(cls, args: list[str] | None = None) -> "PipelineConfig":
        import argparse

        base_config = cls.from_env()

        parser = argparse.ArgumentParser(
            description="BhuDrishti Sentinel-2 NDVI Processing Pipeline",
            formatter_class=argparse.ArgumentDefaultsHelpFormatter
        )

        parser.add_argument(
            "-i", "--input", "--input-zip-directory",
            dest="input_zip_directory",
            type=str,
            default=None,
            help="Path to input ZIP directory containing Sentinel-2 SAFE archives"
        )
        parser.add_argument(
            "-o", "--output", "--output-root-directory",
            dest="output_root_directory",
            type=str,
            default=None,
            help="Path to output root directory"
        )

        mosaic_group = parser.add_mutually_exclusive_group()
        mosaic_group.add_argument(
            "--create-periodic-mosaic", "--mosaic",
            dest="create_periodic_mosaic",
            action="store_true",
            default=None,
            help="Enable periodic CPU mosaic generation"
        )
        mosaic_group.add_argument(
            "--no-periodic-mosaic", "--no-mosaic",
            dest="create_periodic_mosaic",
            action="store_false",
            default=None,
            help="Disable periodic CPU mosaic generation"
        )

        parsed, _ = parser.parse_known_args(args)

        input_dir = Path(parsed.input_zip_directory) if parsed.input_zip_directory else base_config.input_zip_directory
        output_dir = Path(parsed.output_root_directory) if parsed.output_root_directory else base_config.output_root_directory
        create_mosaic = parsed.create_periodic_mosaic if parsed.create_periodic_mosaic is not None else base_config.create_periodic_mosaic

        logs_dir = output_dir / "logs"
        processed_log = logs_dir / "processing_records.jsonl"
        skipped_log = logs_dir / "skipped_files.txt"

        return cls(
            input_zip_directory=input_dir,
            output_root_directory=output_dir,
            india_shapefile_path=base_config.india_shapefile_path,
            temporary_directory=base_config.temporary_directory,
            processed_files_log=processed_log,
            skipped_files_log=skipped_log,
            processing_mode=base_config.processing_mode,
            create_periodic_mosaic=create_mosaic,
            mosaic_method=base_config.mosaic_method,
            block_size=base_config.block_size,
            nodata_value=base_config.nodata_value,
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

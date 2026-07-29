import zipfile
import tempfile
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple, Optional

@dataclass
class ExtractionResult:
    success: bool
    extraction_directory: Optional[Path]
    safe_roots: List[Path]
    error_message: Optional[str]

def is_safe_member_path(member_path: str, target_dir: Path) -> Tuple[bool, Optional[str]]:
    r"""
    Validates that an archive member path does not attempt path traversal
    and remains strictly within the intended extraction directory.
    Explicitly rejects Windows drive paths (C:\, C:/) and UNC network paths (\\, //).
    """
    clean_path = member_path.replace("\\", "/")

    # Reject Windows drive prefix (e.g. C:\ or C:/)
    if len(clean_path) >= 2 and clean_path[1] == ":":
        return False, f"Member path contains Windows drive prefix: {member_path}"

    # Reject UNC paths (\\\\server\\share or //server/share)
    if clean_path.startswith("//") or clean_path.startswith("\\\\"):
        return False, f"Member path contains UNC network prefix: {member_path}"

    # Reject absolute root paths
    if clean_path.startswith("/"):
        return False, f"Member path contains absolute root prefix: {member_path}"

    # Resolve destination path
    try:
        resolved_target = target_dir.resolve()
        resolved_dest = (target_dir / clean_path).resolve()
        # Verify destination path is inside target directory
        if not str(resolved_dest).startswith(str(resolved_target)):
            return False, f"Member path attempts traversal outside target directory: {member_path}"
    except Exception as e:
        return False, f"Member path resolution failed: {member_path} | {e}"

    return True, None

def extract_zip_safely(zip_path: str, target_temp_root: Optional[str] = None, logger=None) -> ExtractionResult:
    """
    Safely extracts a Sentinel-2 ZIP archive after PRE-VALIDATING ALL members.
    If any member is unsafe or corrupted, stops extraction, cleans temp directory, and returns failure.
    """
    if not os.path.exists(zip_path):
        msg = f"ZIP file not found: {zip_path}"
        if logger:
            logger.error(msg)
        return ExtractionResult(success=False, extraction_directory=None, safe_roots=[], error_message=msg)

    # Create isolated extraction directory per ZIP
    prefix = "BHU_SAFE_"
    if target_temp_root and os.path.exists(target_temp_root):
        extract_dir = Path(tempfile.mkdtemp(prefix=prefix, dir=target_temp_root))
    else:
        extract_dir = Path(tempfile.mkdtemp(prefix=prefix))

    if logger:
        logger.info(f"Pre-validating and extracting ZIP: {zip_path}")

    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            member_list = z.infolist()

            # 1. PRE-VALIDATE ALL MEMBERS BEFORE EXTRACTING ANY FILE
            for member in member_list:
                is_safe, err_reason = is_safe_member_path(member.filename, extract_dir)
                if not is_safe:
                    msg = f"Unsafe archive member rejected in '{os.path.basename(zip_path)}': {err_reason}"
                    if logger:
                        logger.error(msg)
                    if extract_dir.exists():
                        shutil.rmtree(extract_dir, ignore_errors=True)
                    return ExtractionResult(success=False, extraction_directory=None, safe_roots=[], error_message=msg)

            # 2. EXTRACT MEMBERS AFTER ALL HAVE BEEN VALIDATED
            z.extractall(extract_dir)

    except zipfile.BadZipFile as e:
        msg = f"Corrupted ZIP archive '{os.path.basename(zip_path)}': {e}"
        if logger:
            logger.error(msg)
        if extract_dir.exists():
            shutil.rmtree(extract_dir, ignore_errors=True)
        return ExtractionResult(success=False, extraction_directory=None, safe_roots=[], error_message=msg)

    except PermissionError as e:
        msg = f"Permission error extracting '{os.path.basename(zip_path)}': {e}"
        if logger:
            logger.error(msg)
        if extract_dir.exists():
            shutil.rmtree(extract_dir, ignore_errors=True)
        return ExtractionResult(success=False, extraction_directory=None, safe_roots=[], error_message=msg)

    except Exception as e:
        msg = f"Unexpected error extracting '{os.path.basename(zip_path)}': {e}"
        if logger:
            logger.error(msg)
        if extract_dir.exists():
            shutil.rmtree(extract_dir, ignore_errors=True)
        return ExtractionResult(success=False, extraction_directory=None, safe_roots=[], error_message=msg)

    # 3. LOCATE SAFE PRODUCTS
    safe_roots: List[Path] = []
    for root, dirs, _ in os.walk(extract_dir):
        for d in dirs:
            if d.endswith(".SAFE"):
                safe_roots.append(Path(root) / d)

    if not safe_roots:
        msg = f"No .SAFE product directories found in ZIP '{os.path.basename(zip_path)}'"
        if logger:
            logger.warning(msg)
        return ExtractionResult(success=True, extraction_directory=extract_dir, safe_roots=[], error_message=msg)

    if logger:
        logger.info(f"Found {len(safe_roots)} SAFE product(s) in {os.path.basename(zip_path)}")

    return ExtractionResult(
        success=True,
        extraction_directory=extract_dir,
        safe_roots=safe_roots,
        error_message=None
    )

def extract_zip_if_valid(zip_path: str, intersects: bool, logger=None) -> Tuple[Optional[str], List[str]]:
    """
    Public entrypoint preserving 100% backwards compatibility with callers expecting
    (extract_dir_str, list_of_safe_root_strings).
    """
    if not intersects:
        if logger:
            logger.info(f"Skipped ZIP (Outside India): {zip_path}")
        return None, []

    res = extract_zip_safely(zip_path, logger=logger)
    if not res.success or not res.extraction_directory:
        return None, []

    safe_paths_str = [str(p) for p in res.safe_roots]
    return str(res.extraction_directory), safe_paths_str
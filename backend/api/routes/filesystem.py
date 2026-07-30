import os
import re
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from config import PipelineConfig
from api.schemas import RootsResponse, RootLocation, DirectoriesResponse, DirectoryItem, CreateDirectoryRequest

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])

RESERVED_WINDOWS_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
}

def get_config() -> PipelineConfig:
    return PipelineConfig.from_env()

def is_contained_in_root(target_path: Path, root_path: Path) -> bool:
    """
    Returns True iff resolved target_path is equal to or inside resolved root_path.
    Prevents sibling prefix attacks (e.g. C:\\data\\input_evil vs C:\\data\\input).
    """
    try:
        res_target = target_path.resolve()
        res_root = root_path.resolve()

        if hasattr(res_target, "is_relative_to"):
            return res_target.is_relative_to(res_root)

        return os.path.commonpath([str(res_root), str(res_target)]) == str(res_root)
    except (ValueError, RuntimeError):
        return False

def resolve_safe_path(root_path: Path, relative_path: str) -> Path:
    """
    Resolves relative_path under root_path and asserts the target path
    remains strictly within root_path.
    Rejects path traversal, drive letters, UNC paths, and symlink escapes.
    """
    clean_rel = relative_path.replace("\\", "/").strip()

    # Reject Windows drive letters (C:, D:)
    if len(clean_rel) >= 2 and clean_rel[1] == ":":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid path: Windows drive letters are not allowed in relative paths: '{relative_path}'"
        )

    # Reject UNC network paths
    if clean_rel.startswith("//") or clean_rel.startswith("\\\\"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid path: UNC network paths are not allowed: '{relative_path}'"
        )

    # Reject leading slashes
    if clean_rel.startswith("/"):
        clean_rel = clean_rel.lstrip("/")

    try:
        resolved_root = root_path.resolve()
        target_path = (root_path / clean_rel).resolve()

        # Enforce strict boundary containment check
        if not is_contained_in_root(target_path, resolved_root):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Path '{relative_path}' attempts traversal outside allowed root."
            )
        return target_path
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid path resolution: {e}"
        )

def validate_directory_name(name: str):
    if not name or not name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Directory name cannot be empty.")

    clean_name = name.strip()

    if clean_name in (".", ".."):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Directory name cannot be '.' or '..'.")

    if "/" in clean_name or "\\" in clean_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Directory name cannot contain path separators.")

    if clean_name.endswith(" ") or clean_name.endswith("."):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Directory name cannot end with a space or period.")

    # Check reserved Windows names
    base_stem = clean_name.split(".")[0].upper()
    if base_stem in RESERVED_WINDOWS_NAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Directory name '{clean_name}' uses reserved system name '{base_stem}'."
        )

@router.get("/roots", response_model=RootsResponse)
def get_roots():
    cfg = get_config()
    in_path = cfg.input_zip_directory
    out_path = cfg.output_root_directory

    return RootsResponse(
        input=RootLocation(path=str(in_path.resolve()), exists=in_path.exists()),
        output=RootLocation(path=str(out_path.resolve()), exists=out_path.exists()),
    )

@router.get("/directories", response_model=DirectoriesResponse)
def list_directories(
    scope: str = Query(..., description="Scope: input or output"),
    relative_path: str = Query("", description="Relative path under scope root")
):
    cfg = get_config()
    if scope == "input":
        root = cfg.input_zip_directory
    elif scope == "output":
        root = cfg.output_root_directory
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scope must be 'input' or 'output'.")

    if not root.exists():
        root.mkdir(parents=True, exist_ok=True)

    target_dir = resolve_safe_path(root, relative_path)

    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Directory not found: '{relative_path}'")

    resolved_root = root.resolve()
    resolved_target = target_dir.resolve()

    # Calculate parent relative path
    if resolved_target == resolved_root:
        parent_rel = None
        current_rel = ""
    else:
        parent_dir = resolved_target.parent
        if is_contained_in_root(parent_dir, resolved_root):
            try:
                parent_rel = str(parent_dir.relative_to(resolved_root)).replace("\\", "/")
                if parent_rel == ".":
                    parent_rel = ""
            except ValueError:
                parent_rel = None
        else:
            parent_rel = None

        current_rel = str(resolved_target.relative_to(resolved_root)).replace("\\", "/")

    dir_items: List[DirectoryItem] = []
    try:
        with os.scandir(target_dir) as scanner:
            for entry in sorted(scanner, key=lambda e: e.name.lower()):
                # Exclude hidden, system, and output generated internal folders
                if entry.is_dir(follow_symlinks=False):
                    name = entry.name
                    if name.startswith(".") or name in ("OUTPUT", "logs", "temp"):
                        continue
                    item_rel = f"{current_rel}/{name}".strip("/") if current_rel else name
                    dir_items.append(DirectoryItem(name=name, relative_path=item_rel))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to scan directory: {e}")

    return DirectoriesResponse(
        scope=scope,
        current_relative_path=current_rel,
        parent_relative_path=parent_rel,
        directories=dir_items
    )

@router.post("/directories", response_model=DirectoriesResponse)
def create_directory(req: CreateDirectoryRequest):
    if req.scope != "output":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Creating directories is allowed only under the 'output' scope."
        )

    cfg = get_config()
    root = cfg.output_root_directory
    root.mkdir(parents=True, exist_ok=True)

    validate_directory_name(req.directory_name)
    parent_dir = resolve_safe_path(root, req.parent_relative_path)

    new_dir = (parent_dir / req.directory_name.strip()).resolve()
    resolved_root = root.resolve()

    if not is_contained_in_root(new_dir, resolved_root):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create directory outside output root.")

    try:
        new_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Could not create directory: {e}")

    created_rel = str(new_dir.relative_to(resolved_root)).replace("\\", "/")

    return list_directories(scope="output", relative_path=created_rel)

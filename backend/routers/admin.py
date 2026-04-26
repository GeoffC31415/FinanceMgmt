"""Admin endpoints for data management."""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from backend.schemas.admin import (
    HistoricalReturnsInfo,
    HistoricalReturnsMetadata,
    HistoricalReturnsUploadResponse,
    HistoricalReturnsValidationResponse,
    ValidationIssue,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["admin"])

# --- Metadata persistence ---
_METADATA_DIR = Path(__file__).resolve().parents[2] / "data"
_METADATA_FILE = _METADATA_DIR / "historical_returns_metadata.json"


class _FileMetadata(BaseModel):
    """Per-file metadata stored in the JSON file."""
    last_loaded: str = ""
    source: str = ""
    count: int = 0
    first_year: int = 0
    last_year: int = 0
    mean: float = 0.0
    std: float = 0.0
    min_return: float = 0.0
    max_return: float = 0.0
    min_year: int = 0
    max_year: int = 0


class _MetadataStore(BaseModel):
    """Top-level metadata JSON structure."""
    equity: _FileMetadata = _FileMetadata()
    bond: _FileMetadata = _FileMetadata()
    loaded_at: str = ""


def _load_metadata() -> _MetadataStore:
    """Load metadata from disk, or return empty defaults."""
    if _METADATA_FILE.exists():
        try:
            return _MetadataStore.model_validate_json(_METADATA_FILE.read_text())
        except Exception:
            return _MetadataStore()
    return _MetadataStore()


def _save_metadata(store: _MetadataStore) -> None:
    """Persist metadata to disk."""
    _METADATA_DIR.mkdir(parents=True, exist_ok=True)
    _METADATA_FILE.write_text(store.model_dump_json(indent=2))


def _info_from_meta(fm: _FileMetadata) -> HistoricalReturnsInfo:
    """Convert stored metadata to the response schema."""
    return HistoricalReturnsInfo(
        count=fm.count,
        first_year=fm.first_year,
        last_year=fm.last_year,
        mean=fm.mean,
        std=fm.std,
        min_return=fm.min_return,
        max_return=fm.max_return,
        min_year=fm.min_year,
        max_year=fm.max_year,
    )


# --- Validation helpers ---

def _validate_returns_data(
    years: list[int], returns: list[float], field_name: str
) -> list[ValidationIssue]:
    """Validate a returns dataset. Returns list of issues (empty = valid)."""
    issues: list[ValidationIssue] = []

    if len(years) < 2:
        issues.append(ValidationIssue(
            field=field_name,
            issue="Data must have at least 2 data points",
            severity="error",
        ))
        return issues

    # Check for NaN / inf
    for i, (y, r) in enumerate(zip(years, returns)):
        if r != r:  # NaN check
            issues.append(ValidationIssue(
                field=field_name,
                issue=f"Row {i+1} (year {y}): NaN return value",
                severity="error",
            ))
        elif abs(r) > 5:  # >500% return is suspicious
            issues.append(ValidationIssue(
                field=field_name,
                issue=f"Row {i+1} (year {y}): Suspicious return {r:.2%}",
                severity="warning",
            ))

    # Check year continuity (allow gaps but warn)
    sorted_years = sorted(years)
    gaps = []
    for i in range(1, len(sorted_years)):
        diff = sorted_years[i] - sorted_years[i - 1]
        if diff > 5:
            gaps.append(f"{sorted_years[i-1]} to {sorted_years[i]}")
    if gaps:
        issues.append(ValidationIssue(
            field=field_name,
            issue=f"Large year gaps found: {', '.join(gaps)}",
            severity="warning",
        ))

    # Check for duplicate years
    if len(years) != len(set(years)):
        dupes = [y for y in years if years.count(y) > 1]
        issues.append(ValidationIssue(
            field=field_name,
            issue=f"Duplicate years found: {set(dupes)}",
            severity="error",
        ))

    return issues


def _parse_csv_returns(content: str) -> tuple[list[int], list[float]]:
    """Parse a CSV/TSV with Year and Returns columns."""
    years: list[int] = []
    returns: list[float] = []

    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="File has no header row")

    # Normalize column names
    col_map = {
        c.strip().lower(): c
        for c in reader.fieldnames
    }
    year_col = col_map.get("year")
    ret_col = col_map.get("returns")

    if not year_col or not ret_col:
        raise HTTPException(
            status_code=400,
            detail=f"Expected 'Year' and 'Returns' columns, found: {reader.fieldnames}",
        )

    for row_num, row in enumerate(reader, start=2):
        year_str = row[year_col].strip()
        ret_str = row[ret_col].strip().replace("%", "")

        try:
            year = int(year_str.split("-")[0])
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Row {row_num}: invalid year '{year_str}'",
            )

        try:
            ret = float(ret_str) / 100.0 if "%" in row[ret_col] else float(ret_str)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Row {row_num}: invalid return '{ret_str}'",
            )

        years.append(year)
        returns.append(ret)

    if not years:
        raise HTTPException(status_code=400, detail="File contains no data rows")

    return years, returns


# --- Endpoints ---


@router.get(
    "/historical-returns/metadata",
    summary="Get historical return data metadata",
    description="Returns metadata about the currently loaded historical return datasets.",
    response_model=HistoricalReturnsMetadata,
)
def get_returns_metadata() -> HistoricalReturnsMetadata:
    store = _load_metadata()
    return HistoricalReturnsMetadata(
        equity=_info_from_meta(store.equity),
        bond=_info_from_meta(store.bond),
    )


@router.post(
    "/historical-returns/upload",
    summary="Upload new historical return data",
    description="Upload a CSV/TSV file with 'Year' and 'Returns' columns. "
    "The file is validated before being saved. Existing data is replaced.",
    response_model=HistoricalReturnsUploadResponse,
)
async def upload_historical_returns(file: UploadFile) -> HistoricalReturnsUploadResponse:
    if file.content_type not in ("text/csv", "text/tab-separated-values", "application/octet-stream"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type: {file.content_type}. Expected CSV or TSV.",
        )

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8")

    if not text.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    filename = file.filename or "upload"
    years, returns = _parse_csv_returns(text)

    # Validate
    issues = _validate_returns_data(years, returns, "equity")
    errors = [i for i in issues if i.severity == "error"]
    if errors:
        raise HTTPException(
            status_code=422,
            detail=HistoricalReturnsValidationResponse(
                valid=False, issues=errors
            ).model_dump(),
        )

    # Compute stats
    import numpy as np
    ret_arr = np.array(returns, dtype=np.float64)
    year_arr = np.array(years, dtype=np.int32)
    stats = {
        "count": len(returns),
        "first_year": int(np.min(year_arr)),
        "last_year": int(np.max(year_arr)),
        "mean": float(np.mean(ret_arr)),
        "std": float(np.std(ret_arr, ddof=1)),
        "min_return": float(np.min(ret_arr)),
        "max_return": float(np.max(ret_arr)),
        "min_year": int(year_arr[int(np.argmin(ret_arr))]),
        "max_year": int(year_arr[int(np.argmax(ret_arr))]),
    }

    # Save file
    data_dir = Path(__file__).resolve().parents[2] / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    target_path = data_dir / filename
    target_path.write_bytes(content)

    # Update metadata
    now = datetime.now(timezone.utc).isoformat()
    store = _load_metadata()
    store.equity = _FileMetadata(
        last_loaded=now,
        source=filename,
        **stats,
    )
    store.loaded_at = now
    _save_metadata(store)

    logger.info("Uploaded historical returns: %s (%d rows)", filename, len(returns))

    return HistoricalReturnsUploadResponse(
        message=f"Data saved as '{filename}' ({len(returns)} rows)",
        equity=_info_from_meta(store.equity),
    )


@router.post(
    "/historical-returns/bond-upload",
    summary="Upload new bond return data",
    description="Upload a CSV/TSV file with 'Year' and 'Returns' columns for bond data.",
    response_model=HistoricalReturnsUploadResponse,
)
async def upload_bond_returns(file: UploadFile) -> HistoricalReturnsUploadResponse:
    if file.content_type not in ("text/csv", "text/tab-separated-values", "application/octet-stream"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type: {file.content_type}. Expected CSV or TSV.",
        )

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8")

    if not text.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    filename = file.filename or "bond_upload"
    years, returns = _parse_csv_returns(text)

    # Validate
    issues = _validate_returns_data(years, returns, "bond")
    errors = [i for i in issues if i.severity == "error"]
    if errors:
        raise HTTPException(
            status_code=422,
            detail=HistoricalReturnsValidationResponse(
                valid=False, issues=errors
            ).model_dump(),
        )

    # Compute stats
    import numpy as np
    ret_arr = np.array(returns, dtype=np.float64)
    year_arr = np.array(years, dtype=np.int32)
    stats = {
        "count": len(returns),
        "first_year": int(np.min(year_arr)),
        "last_year": int(np.max(year_arr)),
        "mean": float(np.mean(ret_arr)),
        "std": float(np.std(ret_arr, ddof=1)),
        "min_return": float(np.min(ret_arr)),
        "max_return": float(np.max(ret_arr)),
        "min_year": int(year_arr[int(np.argmin(ret_arr))]),
        "max_year": int(year_arr[int(np.argmax(ret_arr))]),
    }

    # Save file
    data_dir = Path(__file__).resolve().parents[2] / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    target_path = data_dir / filename
    target_path.write_bytes(content)

    # Update metadata
    now = datetime.now(timezone.utc).isoformat()
    store = _load_metadata()
    store.bond = _FileMetadata(
        last_loaded=now,
        source=filename,
        **stats,
    )
    store.loaded_at = now
    _save_metadata(store)

    logger.info("Uploaded bond returns: %s (%d rows)", filename, len(returns))

    return HistoricalReturnsUploadResponse(
        message=f"Bond data saved as '{filename}' ({len(returns)} rows)",
        bond=_info_from_meta(store.bond),
    )

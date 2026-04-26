"""Pydantic schemas for admin endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class HistoricalReturnsMetadata(BaseModel):
    """Metadata about the currently loaded historical return data."""
    equity: HistoricalReturnsInfo = Field(description="S&P 500 equity data metadata")
    bond: HistoricalReturnsInfo = Field(description="US 10Y Treasury bond data metadata")


class HistoricalReturnsInfo(BaseModel):
    """Summary info for one return dataset."""
    count: int = Field(description="Number of data points")
    first_year: int = Field(description="Earliest year in the dataset")
    last_year: int = Field(description="Latest year in the dataset")
    mean: float = Field(description="Mean annual return (decimal)")
    std: float = Field(description="Standard deviation of annual returns")
    min_return: float = Field(description="Worst annual return")
    max_return: float = Field(description="Best annual return")
    min_year: int = Field(description="Year of worst return")
    max_year: int = Field(description="Year of best return")


class HistoricalReturnsUploadResponse(BaseModel):
    """Response after uploading new historical return data."""
    message: str = Field(description="Status message")
    equity: HistoricalReturnsInfo | None = Field(
        default=None, description="Metadata for the newly loaded equity data"
    )
    bond: HistoricalReturnsInfo | None = Field(
        default=None, description="Metadata for the newly loaded bond data"
    )


class ValidationIssue(BaseModel):
    """A single validation issue found in uploaded data."""
    field: str = Field(description="Which dataset: 'equity' or 'bond'")
    issue: str = Field(description="Description of the issue")
    severity: str = Field(description="Severity level: 'error' or 'warning'")


class HistoricalReturnsValidationResponse(BaseModel):
    """Validation result for historical return data."""
    valid: bool = Field(description="Whether the data is valid")
    issues: list[ValidationIssue] = Field(description="List of validation issues")

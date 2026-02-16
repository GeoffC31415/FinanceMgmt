"""
Historical S&P 500 annual returns loader.

Parses historical_returns.tsv once at import time and exposes the data
as a NumPy array for bootstrap sampling in Monte Carlo simulations.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

_TSV_PATH = Path(__file__).resolve().parents[2] / "historical_returns.tsv"

_returns: np.ndarray | None = None
_years: np.ndarray | None = None


def _load() -> tuple[np.ndarray, np.ndarray]:
    """Parse the TSV file, returning (years, returns) arrays."""
    global _returns, _years
    if _returns is not None and _years is not None:
        return _years, _returns

    years_list: list[int] = []
    returns_list: list[float] = []

    with open(_TSV_PATH, "r") as f:
        for line_num, line in enumerate(f):
            if line_num == 0:
                continue  # skip header
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            # Handle possible extra whitespace (e.g. "1931-12-31 \t-47.07%")
            year_str = parts[0].strip()
            ret_str = parts[1].strip()

            year = int(year_str.split("-")[0])
            ret = float(ret_str.replace("%", "")) / 100.0

            years_list.append(year)
            returns_list.append(ret)

    _years = np.array(years_list, dtype=np.int32)
    _returns = np.array(returns_list, dtype=np.float64)
    return _years, _returns


def get_historical_returns() -> np.ndarray:
    """Return the array of historical annual returns as decimals (e.g. 0.05 = 5%)."""
    _, returns = _load()
    return returns


def get_historical_years() -> np.ndarray:
    """Return the array of years corresponding to each return."""
    years, _ = _load()
    return years


def get_historical_stats() -> dict:
    """Return summary statistics of the historical returns."""
    years, returns = _load()
    return {
        "count": int(len(returns)),
        "mean": float(np.mean(returns)),
        "std": float(np.std(returns, ddof=1)),
        "min": float(np.min(returns)),
        "max": float(np.max(returns)),
        "min_year": int(years[int(np.argmin(returns))]),
        "max_year": int(years[int(np.argmax(returns))]),
        "first_year": int(np.min(years)),
        "last_year": int(np.max(years)),
    }

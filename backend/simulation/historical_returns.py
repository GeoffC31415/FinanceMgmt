"""
Historical returns loader for S&P 500 equities and US 10-Year Treasury bonds.

Parses TSV files once at import time and exposes the data as NumPy arrays
for bootstrap sampling in Monte Carlo simulations.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_EQUITY_TSV_PATH = _DATA_DIR / "historical_returns.tsv"
_BOND_TSV_PATH = _DATA_DIR / "historical_bond_returns.tsv"

_equity_returns: np.ndarray | None = None
_equity_years: np.ndarray | None = None
_bond_returns: np.ndarray | None = None
_bond_years: np.ndarray | None = None


def _load_tsv(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Parse a TSV file with Year/Returns columns, returning (years, returns) arrays."""
    years_list: list[int] = []
    returns_list: list[float] = []

    with open(path, "r") as f:
        for line_num, line in enumerate(f):
            if line_num == 0:
                continue  # skip header
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t") if "\t" in line else line.split()
            year_str = parts[0].strip()
            ret_str = parts[1].strip()

            year = int(year_str.split("-")[0])
            ret = float(ret_str.replace("%", "")) / 100.0

            years_list.append(year)
            returns_list.append(ret)

    years = np.array(years_list, dtype=np.int32)
    returns = np.array(returns_list, dtype=np.float64)
    return years, returns


# --- S&P 500 equity returns ---

def _load_equity() -> tuple[np.ndarray, np.ndarray]:
    global _equity_returns, _equity_years
    if _equity_returns is not None and _equity_years is not None:
        return _equity_years, _equity_returns
    _equity_years, _equity_returns = _load_tsv(_EQUITY_TSV_PATH)
    return _equity_years, _equity_returns


def get_historical_returns() -> np.ndarray:
    """Return the array of historical S&P 500 annual returns as decimals (e.g. 0.05 = 5%)."""
    _, returns = _load_equity()
    return returns


def get_historical_years() -> np.ndarray:
    """Return the array of years corresponding to each equity return."""
    years, _ = _load_equity()
    return years


def get_historical_stats() -> dict:
    """Return summary statistics of the historical S&P 500 returns."""
    years, returns = _load_equity()
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


# --- US 10-Year Treasury bond returns ---

def _load_bonds() -> tuple[np.ndarray, np.ndarray]:
    global _bond_returns, _bond_years
    if _bond_returns is not None and _bond_years is not None:
        return _bond_years, _bond_returns
    _bond_years, _bond_returns = _load_tsv(_BOND_TSV_PATH)
    return _bond_years, _bond_returns


def get_historical_bond_returns() -> np.ndarray:
    """Return the array of historical US 10-Year Treasury annual total returns as decimals."""
    _, returns = _load_bonds()
    return returns


def get_historical_bond_years() -> np.ndarray:
    """Return the array of years corresponding to each bond return."""
    years, _ = _load_bonds()
    return years


def get_historical_bond_stats() -> dict:
    """Return summary statistics of the historical bond returns."""
    years, returns = _load_bonds()
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


# --- Aligned equity + bond data (overlapping years only) ---

_aligned_equity: np.ndarray | None = None
_aligned_bonds: np.ndarray | None = None


def get_aligned_equity_bond_returns() -> tuple[np.ndarray, np.ndarray]:
    """Return equity and bond return arrays trimmed to their overlapping year range.

    The equity data starts in 1928 while bonds start in 1960, so we
    restrict both to the years that appear in both datasets. This ensures
    the same index maps to the same calendar year in both arrays, which is
    essential for preserving the equity-bond correlation during sampling.
    """
    global _aligned_equity, _aligned_bonds
    if _aligned_equity is not None and _aligned_bonds is not None:
        return _aligned_equity, _aligned_bonds

    eq_years, eq_returns = _load_equity()
    bd_years, bd_returns = _load_bonds()

    # Build year -> return lookup for each dataset
    eq_lookup = dict(zip(eq_years.tolist(), eq_returns.tolist()))
    bd_lookup = dict(zip(bd_years.tolist(), bd_returns.tolist()))

    # Find overlapping years and sort them
    common_years = sorted(set(eq_lookup.keys()) & set(bd_lookup.keys()))

    _aligned_equity = np.array([eq_lookup[y] for y in common_years], dtype=np.float64)
    _aligned_bonds = np.array([bd_lookup[y] for y in common_years], dtype=np.float64)
    return _aligned_equity, _aligned_bonds

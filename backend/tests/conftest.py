"""Shared test fixtures for the backend test suite."""
from __future__ import annotations

import pytest


# Ensure asyncio mode is configured for pytest-asyncio
@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

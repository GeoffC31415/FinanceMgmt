from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Scenario(Base, TimestampMixin):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)

    assumptions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    people = relationship("Person", back_populates="scenario", cascade="all, delete-orphan")
    incomes = relationship("Income", back_populates="scenario", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="scenario", cascade="all, delete-orphan")
    mortgage = relationship("Mortgage", back_populates="scenario", uselist=False, cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="scenario", cascade="all, delete-orphan")


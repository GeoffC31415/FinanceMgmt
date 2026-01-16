from __future__ import annotations

from datetime import date
from uuid import uuid4

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Person(Base, TimestampMixin):
    __tablename__ = "people"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)

    label: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "you", "partner"
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)

    planned_retirement_age: Mapped[int] = mapped_column(Integer, nullable=False)
    state_pension_age: Mapped[int] = mapped_column(Integer, nullable=False, default=67)

    scenario = relationship("Scenario", back_populates="people")


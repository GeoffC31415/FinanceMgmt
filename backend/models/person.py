from __future__ import annotations

from datetime import date
from uuid import uuid4

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Person(Base, TimestampMixin):
    __tablename__ = "people"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)

    label: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "you", "partner", "child1"
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Adult-specific fields (nullable for children)
    planned_retirement_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    state_pension_age: Mapped[int | None] = mapped_column(Integer, nullable=True, default=67)

    # Child-specific fields
    is_child: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    annual_cost: Mapped[float | None] = mapped_column(Float, nullable=True)  # Annual cost of raising the child
    leaves_household_age: Mapped[int | None] = mapped_column(Integer, nullable=True, default=18)  # Age when child leaves

    scenario = relationship("Scenario", back_populates="people")


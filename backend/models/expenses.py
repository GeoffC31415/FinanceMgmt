from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Expense(Base, TimestampMixin):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    monthly_amount: Mapped[float] = mapped_column(Float, nullable=False)

    start_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_inflation_linked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    scenario = relationship("Scenario", back_populates="expenses")


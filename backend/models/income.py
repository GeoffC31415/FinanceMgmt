from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Income(Base, TimestampMixin):
    __tablename__ = "incomes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)
    person_id: Mapped[str | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"), nullable=True)

    kind: Mapped[str] = mapped_column(String(50), nullable=False, default="salary")

    gross_annual: Mapped[float] = mapped_column(Float, nullable=False)
    annual_growth_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # e.g. 0.03

    employee_pension_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # 0..1
    employer_pension_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # 0..1

    start_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    scenario = relationship("Scenario", back_populates="incomes")
    person = relationship("Person")


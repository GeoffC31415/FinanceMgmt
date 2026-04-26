from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Property(Base, TimestampMixin):
    __tablename__ = "properties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)
    person_id: Mapped[str | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"), nullable=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    appreciation_rate_mean: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    appreciation_rate_std: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    monthly_rental_income: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    rental_growth_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    occupancy_rate: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    mortgage_ltv: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mortgage_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    mortgage_term_years: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    annual_maintenance_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    maintenance_is_inflation_linked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    withdrawal_priority: Mapped[int] = mapped_column(Integer, nullable=False, default=15)

    scenario = relationship("Scenario", back_populates="properties")
    person = relationship("Person")

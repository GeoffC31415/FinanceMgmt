from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Mortgage(Base, TimestampMixin):
    __tablename__ = "mortgages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    scenario_id: Mapped[str] = mapped_column(
        ForeignKey("scenarios.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    balance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    annual_interest_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # e.g. 0.045
    monthly_payment: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    scenario = relationship("Scenario", back_populates="mortgage")


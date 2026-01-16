from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base, TimestampMixin


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False)
    person_id: Mapped[str | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"), nullable=True)

    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # "isa" | "pension" | "cash"
    balance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    annual_contribution: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    scenario = relationship("Scenario", back_populates="assets")
    person = relationship("Person")


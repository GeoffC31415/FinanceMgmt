from __future__ import annotations

from dataclasses import dataclass

from backend.simulation.entities.base import SimContext


@dataclass
class MortgageAccount:
    balance: float
    annual_interest_rate: float
    monthly_payment: float
    months_remaining: int

    _interest_paid: float = 0.0
    _principal_paid: float = 0.0
    _payment_made: float = 0.0

    def step(self, *, context: SimContext) -> None:
        self._interest_paid = 0.0
        self._principal_paid = 0.0
        self._payment_made = 0.0

        if self.balance <= 0 or self.months_remaining <= 0:
            self.balance = max(0.0, self.balance)
            self.months_remaining = max(0, self.months_remaining)
            return

        monthly_rate = self.annual_interest_rate / 12.0
        for _ in range(12):
            if self.balance <= 0 or self.months_remaining <= 0:
                break

            interest = self.balance * monthly_rate
            payment = min(self.monthly_payment, self.balance + interest)
            principal = max(0.0, payment - interest)

            self._interest_paid += interest
            self._principal_paid += principal
            self._payment_made += payment

            self.balance = max(0.0, self.balance + interest - payment)
            self.months_remaining -= 1

    def get_balance_sheet(self) -> dict[str, float]:
        return {"mortgage_balance": self.balance}

    def get_cash_flows(self) -> dict[str, float]:
        return {
            "mortgage_payment": self._payment_made,
            "mortgage_interest_paid": self._interest_paid,
            "mortgage_principal_paid": self._principal_paid,
        }


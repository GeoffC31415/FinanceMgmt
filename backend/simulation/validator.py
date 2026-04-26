"""Simulation scenario validation.

Validates scenario inputs before simulation to catch common errors early
(negative balances, impossible dates, etc.) and return structured errors.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from backend.simulation.engine import SimulationScenario


@dataclass(frozen=True)
class ValidationIssue:
    """A single validation issue found in a scenario."""
    field: str
    message: str
    severity: str = "error"  # "error" or "warning"


@dataclass(frozen=True)
class ValidationReport:
    """Result of validating a simulation scenario."""
    issues: list[ValidationIssue]
    is_valid: bool = True

    def __post_init__(self) -> None:
        has_errors = any(i.severity == "error" for i in self.issues)
        if has_errors:
            object.__setattr__(self, "is_valid", False)

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")

    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "issues": [
                {"field": i.field, "message": i.message, "severity": i.severity}
                for i in self.issues
            ],
        }


def validate_scenario(scenario: SimulationScenario) -> ValidationReport:
    """Validate a SimulationScenario and return a report of issues.

    Checks include:
    - All balances >= 0
    - All growth_rate_std >= 0
    - Retirement age > birth year
    - Pension access age <= planned retirement age
    - No zero-volatility assets with non-zero mean return (degenerate)
    - Start year <= end year
    - At least one person
    """
    issues: list[ValidationIssue] = []

    # Basic scenario-level checks
    if scenario.start_year > scenario.end_year:
        issues.append(ValidationIssue(
            field="start_year",
            message=f"Start year ({scenario.start_year}) is after end year ({scenario.end_year})",
            severity="error",
        ))

    if len(scenario.people) == 0:
        issues.append(ValidationIssue(
            field="people",
            message="Scenario must have at least one person",
            severity="error",
        ))

    # Check each person
    for person in scenario.people:
        if person.planned_retirement_age is not None and person.birth_date is not None:
            retirement_year = person.birth_date.year + person.planned_retirement_age
            if scenario.start_year > retirement_year:
                issues.append(ValidationIssue(
                    field=f"person.{person.key}.planned_retirement_age",
                    message=(
                        f"Planned retirement year ({retirement_year}) is before "
                        f"simulation start year ({scenario.start_year})"
                    ),
                    severity="warning",
                ))

        if person.state_pension_age is not None and person.planned_retirement_age is not None:
            if person.state_pension_age > person.planned_retirement_age:
                issues.append(ValidationIssue(
                    field=f"person.{person.key}.state_pension_age",
                    message=(
                        f"State pension age ({person.state_pension_age}) is after "
                        f"planned retirement age ({person.planned_retirement_age})"
                    ),
                    severity="warning",
                ))

    # Check assets
    for asset in scenario.assets:
        if asset.balance < 0:
            issues.append(ValidationIssue(
                field=f"asset.{asset.name}.balance",
                message=f"Asset '{asset.name}' has negative balance ({asset.balance})",
                severity="error",
            ))
        if asset.growth_rate_std < 0:
            issues.append(ValidationIssue(
                field=f"asset.{asset.name}.growth_rate_std",
                message=f"Asset '{asset.name}' has negative growth rate std ({asset.growth_rate_std})",
                severity="error",
            ))

    # Check pensions
    for key, pension in scenario.pension_by_person.items():
        if pension.balance < 0:
            issues.append(ValidationIssue(
                field=f"pension.{key}.balance",
                message=f"Pension for '{key}' has negative balance ({pension.balance})",
                severity="error",
            ))
        if pension.growth_rate_std < 0:
            issues.append(ValidationIssue(
                field=f"pension.{key}.growth_rate_std",
                message=f"Pension for '{key}' has negative growth rate std ({pension.growth_rate_std})",
                severity="error",
            ))

    # Check properties
    for prop in scenario.properties:
        if prop.value < 0:
            issues.append(ValidationIssue(
                field=f"property.{prop.name}.value",
                message=f"Property '{prop.name}' has negative value ({prop.value})",
                severity="error",
            ))

    # Warnings for degenerate cases (zero volatility with non-zero mean)
    for asset in scenario.assets:
        if asset.growth_rate_std == 0 and asset.growth_rate_mean != 0:
            issues.append(ValidationIssue(
                field=f"asset.{asset.name}.growth_rate_std",
                message=(
                    f"Asset '{asset.name}' has zero volatility but non-zero mean "
                    f"({asset.growth_rate_mean}). This produces deterministic results "
                    f"and may not reflect real-world uncertainty."
                ),
                severity="warning",
            ))

    return ValidationReport(issues=issues)

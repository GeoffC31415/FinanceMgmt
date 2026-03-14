import { useMemo } from "react";
import type { SimulationResponse, SafeWithdrawalResponse, ScenarioRead } from "../types";

type Insight = {
  icon: "check" | "info" | "warning" | "money" | "home" | "child";
  color: "emerald" | "cyan" | "amber" | "rose";
  text: string;
};

type Props = {
  result: SimulationResponse;
  safe_withdrawal: SafeWithdrawalResponse | null;
  risk_threshold: number;
  current_fun_fund: number;
  scenario: ScenarioRead;
  mortgage_payoff_year: number | null;
  children_leaving: { name: string; year: number }[];
};

function format_currency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1)}m`;
  }
  return `£${Math.round(value).toLocaleString()}`;
}

function mortgage_monthly_payment(property: ScenarioRead["properties"][number]): number {
  const balance = property.value * property.mortgage_ltv;
  if (balance <= 0 || property.mortgage_rate < 0) return 0;

  const monthly_rate = property.mortgage_rate / 12;
  if (property.mortgage_term_years <= 0) return balance * monthly_rate;

  const periods = property.mortgage_term_years * 12;
  if (monthly_rate === 0) return periods > 0 ? balance / periods : 0;

  const growth = (1 + monthly_rate) ** periods;
  return (balance * monthly_rate * growth) / (growth - 1);
}

const ICON_PATHS: Record<Insight["icon"], string> = {
  check: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  info: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
  warning: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  money: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  home: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  child: "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
};

const COLOR_MAP: Record<Insight["color"], { icon: string; bg: string; border: string }> = {
  emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/20" },
  cyan: { icon: "text-cyan-400", bg: "bg-cyan-500/5", border: "border-cyan-500/20" },
  amber: { icon: "text-amber-400", bg: "bg-amber-500/5", border: "border-amber-500/20" },
  rose: { icon: "text-rose-400", bg: "bg-rose-500/5", border: "border-rose-500/20" },
};

export function OverviewInsights({
  result,
  safe_withdrawal,
  risk_threshold,
  current_fun_fund,
  scenario,
  mortgage_payoff_year,
  children_leaving,
}: Props) {
  const insights = useMemo(() => {
    const items: Insight[] = [];
    const last_idx = result.years.length - 1;
    if (last_idx < 0) return items;

    const final_bankruptcy_pct = result.is_bankrupt_median[last_idx] ?? 0;
    const success_rate = 100 - final_bankruptcy_pct;

    // Fixed annual expenditure from scenario config
    const fixed_annual_expenses = scenario.expenses.reduce(
      (sum, e) => sum + e.monthly_amount * 12,
      0
    );
    const mortgage_annual = scenario.properties.reduce(
      (sum, property) => sum + mortgage_monthly_payment(property) * 12,
      0
    );
    const base_annual_costs = fixed_annual_expenses + mortgage_annual;

    // Safe spending insight
    if (safe_withdrawal) {
      const max_safe = safe_withdrawal.max_safe_fun_fund;
      if (max_safe > 0) {
        const total_safe = base_annual_costs + max_safe;
        items.push({
          icon: "money",
          color: current_fun_fund <= max_safe ? "emerald" : "rose",
          text: `You can safely spend up to ${format_currency(total_safe)}/yr in retirement (${format_currency(base_annual_costs)}/yr fixed costs + up to ${format_currency(max_safe)}/yr discretionary) without exceeding ${risk_threshold}% bankruptcy risk.`,
        });
      }
    }

    // Over-spending warning
    if (safe_withdrawal && current_fun_fund > safe_withdrawal.max_safe_fun_fund && safe_withdrawal.max_safe_fun_fund > 0) {
      const over_by = current_fun_fund - safe_withdrawal.max_safe_fun_fund;
      items.push({
        icon: "warning",
        color: "rose",
        text: `Current discretionary spending exceeds the safe limit by ${format_currency(over_by)}/yr. Consider reducing to improve your success rate.`,
      });
    }

    // Success rate summary
    if (success_rate >= 99) {
      items.push({
        icon: "check",
        color: "emerald",
        text: `${success_rate.toFixed(1)}% success rate -- your plan is very robust across simulated market conditions.`,
      });
    } else if (success_rate >= 95) {
      items.push({
        icon: "check",
        color: "emerald",
        text: `${success_rate.toFixed(1)}% success rate -- your plan has a comfortable safety margin.`,
      });
    } else if (success_rate >= 90) {
      items.push({
        icon: "info",
        color: "amber",
        text: `${success_rate.toFixed(1)}% success rate -- reasonable, but consider building more buffer.`,
      });
    } else {
      items.push({
        icon: "warning",
        color: "rose",
        text: `${success_rate.toFixed(1)}% success rate -- consider reducing spending, delaying retirement, or increasing savings.`,
      });
    }

    // Peak net worth
    let peak_value = -Infinity;
    let peak_year = result.years[0];
    for (let i = 0; i <= last_idx; i++) {
      if (result.net_worth_median[i] > peak_value) {
        peak_value = result.net_worth_median[i];
        peak_year = result.years[i];
      }
    }
    if (peak_value > 0) {
      items.push({
        icon: "info",
        color: "cyan",
        text: `Net worth peaks at ${format_currency(peak_value)} in ${peak_year} (median scenario).`,
      });
    }

    // Mortgage payoff
    if (mortgage_payoff_year) {
      items.push({
        icon: "home",
        color: "emerald",
        text: `Mortgage paid off by ${mortgage_payoff_year} in the majority of simulations.`,
      });
    }

    // Children leaving home
    for (const child of children_leaving) {
      const child_person = scenario.people.find(
        (p) => p.is_child && p.label === child.name
      );
      const annual_cost = child_person?.annual_cost;
      const cost_note = annual_cost
        ? ` -- saving approximately ${format_currency(annual_cost)}/yr`
        : "";
      items.push({
        icon: "child",
        color: "cyan",
        text: `${child.name} leaves home in ${child.year}${cost_note}.`,
      });
    }

    // Retirement year info
    if (result.retirement_years.length > 0) {
      const adults = scenario.people.filter(
        (p) => !p.is_child && p.planned_retirement_age != null
      );
      if (adults.length > 0) {
        const retirement_notes = adults.map((a) => {
          const birth_year = parseInt(a.birth_date.split("-")[0], 10);
          const ret_age = a.planned_retirement_age!;
          return `${a.label} at age ${ret_age} (${birth_year + ret_age})`;
        });
        items.push({
          icon: "info",
          color: "cyan",
          text: `Planned retirement: ${retirement_notes.join(", ")}.`,
        });
      }
    }

    return items;
  }, [result, safe_withdrawal, risk_threshold, current_fun_fund, scenario, mortgage_payoff_year, children_leaving]);

  if (insights.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Key Insights
      </h3>
      <ul className="space-y-2">
        {insights.map((insight, idx) => {
          const colors = COLOR_MAP[insight.color];
          return (
            <li
              key={idx}
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${colors.bg} ${colors.border}`}
            >
              <svg
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${colors.icon}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={ICON_PATHS[insight.icon]}
                />
              </svg>
              <span className="text-slate-200">{insight.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import type { ScenarioCreate } from "../../types";
import { useScenarioCreate } from "../../hooks/useScenario";
import { sampleScenario, starterScenario } from "../../data/scenarioTemplates";
import { Button, ButtonLink } from "../ui/Button";
import { Card, CardBody } from "../ui/Card";

type Props = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  onScenarioCreated?: () => Promise<void> | void;
};

const steps = [
  { title: "Set up your household", body: "Add adults, children, income, pensions, property, and day-to-day spending." },
  { title: "Run a projection", body: "Stress-test the plan with many market-return paths instead of a single straight line." },
  { title: "Improve the plan", body: "Explore safer spending, retirement timing, taxes, and investment allocation trade-offs." },
];

const featureCards = [
  { title: "Plain-English setup", body: "Start with a guided walkthrough, then refine details in the full editor." },
  { title: "UK-aware modelling", body: "Includes simplified UK income tax, NI, state pension, pension drawdown, ISA/GIA wrappers, and CGT assumptions." },
  { title: "Risk-first results", body: "Look beyond the median outcome with pessimistic percentiles, depletion risk, and severe shortfall warnings." },
];

export function IntroPage({ title = "Plan retirement with less guesswork", subtitle, compact = false, onScenarioCreated }: Props) {
  const navigate = useNavigate();
  const { create, is_loading, error } = useScenarioCreate();

  async function createFromTemplate(template: ScenarioCreate, destination: "projection" | "setup") {
    const created = await create(template);
    await onScenarioCreated?.();
    if (destination === "setup") {
      navigate(`/config?selected=${created.id}`);
      return;
    }
    navigate("/");
  }

  return (
    <div className={compact ? "space-y-6" : "space-y-8"}>
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-slate-950/40 sm:p-10">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-24 left-12 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              Household finance projections • UK tax assumptions • Monte Carlo risk
            </div>
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              {subtitle ?? "Build a financial plan, run thousands of possible futures, and see where your retirement plan is resilient — or where it needs attention."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/config/wizard" variant="primary" size="lg">Use Guided Setup</ButtonLink>
              <Button onClick={() => createFromTemplate(sampleScenario, "projection")} disabled={is_loading} variant="secondary" size="lg">
                Load sample plan
              </Button>
              <Button onClick={() => createFromTemplate(starterScenario, "setup")} disabled={is_loading} variant="ghost" size="lg">
                Start from template
              </Button>
            </div>
            {error && <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-950/50 px-4 py-3 text-sm text-rose-100">{error}</div>}
          </div>

          <Card tone="highlight" className="relative">
            <CardBody className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-300">Example plan health</div>
                  <div className="mt-1 text-3xl font-bold text-white">Caution</div>
                </div>
                <div className="rounded-full bg-amber-300/15 px-3 py-1 text-sm font-semibold text-amber-100">Needs review</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div className="rounded-2xl bg-slate-950/45 p-4">
                  <div className="text-xs text-slate-400">Safe extra spend</div>
                  <div className="mt-1 text-xl font-semibold text-cyan-100">£31k/yr</div>
                </div>
                <div className="rounded-2xl bg-slate-950/45 p-4">
                  <div className="text-xs text-slate-400">Severe shortfall</div>
                  <div className="mt-1 text-xl font-semibold text-amber-100">7%</div>
                </div>
                <div className="rounded-2xl bg-slate-950/45 p-4">
                  <div className="text-xs text-slate-400">Median final net worth</div>
                  <div className="mt-1 text-xl font-semibold text-emerald-100">£820k</div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                “Most shortfall risk appears between early retirement and state pension age. Try reducing extra retirement spending or delaying retirement by 1–2 years.”
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {featureCards.map((feature) => (
          <Card key={feature.title}>
            <CardBody>
              <h2 className="text-base font-semibold text-white">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{feature.body}</p>
            </CardBody>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {steps.map((step, idx) => (
          <Card key={step.title} tone="muted">
            <CardBody>
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/15 text-sm font-bold text-cyan-100">{idx + 1}</div>
              <h2 className="text-base font-semibold text-white">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{step.body}</p>
            </CardBody>
          </Card>
        ))}
      </section>
    </div>
  );
}

import { NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./components/Dashboard";
import { ComparisonDashboard } from "./components/ComparisonDashboard";
import { ScenarioConfigPage } from "./components/config/ScenarioConfigPage";
import { ConfigWizard } from "./components/config/ConfigWizard";
import { HelpPage } from "./components/HelpPage";
import { IntroPage } from "./components/onboarding/IntroPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-2 transition ${
    isActive ? "bg-white/10 text-white shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"
  }`;

export function App() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(139,92,246,0.18),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#0f172a_48%,_#111827_100%)] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <NavLink to="/intro" className="group flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-violet-500 font-black text-slate-950 shadow-lg shadow-cyan-950/40">F</span>
            <span className="text-lg font-semibold tracking-tight text-white group-hover:text-cyan-100">Finance Planner</span>
          </NavLink>
          <nav className="flex flex-wrap justify-end gap-2 text-sm">
            <NavLink to="/" className={navLinkClass} end>
              Projection
            </NavLink>
            <NavLink to="/compare" className={navLinkClass}>
              Compare Plans
            </NavLink>
            <NavLink to="/config" className={navLinkClass}>
              Plan Setup
            </NavLink>
            <NavLink to="/help" className={navLinkClass}>
              Learn
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/intro" element={<IntroPage />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/compare" element={<ComparisonDashboard />} />
          <Route path="/config" element={<ScenarioConfigPage />} />
          <Route path="/config/wizard" element={<ConfigWizard />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </main>
    </div>
  );
}

import { NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./components/Dashboard";
import { ScenarioConfigPage } from "./components/config/ScenarioConfigPage";
import { ConfigWizard } from "./components/config/ConfigWizard";

export function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="text-lg font-semibold">Finances Simulator</div>
          <nav className="flex gap-4 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded px-3 py-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900"}`
              }
              end
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/config"
              className={({ isActive }) =>
                `rounded px-3 py-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900"}`
              }
            >
              Config
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/config" element={<ScenarioConfigPage />} />
          <Route path="/config/wizard" element={<ConfigWizard />} />
        </Routes>
      </main>
    </div>
  );
}


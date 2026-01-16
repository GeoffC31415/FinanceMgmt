import { NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./components/Dashboard";
import { ScenarioConfigPage } from "./components/config/ScenarioConfigPage";
import { ConfigWizard } from "./components/config/ConfigWizard";
import { HelpPage } from "./components/HelpPage";

export function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex w-[70%] min-w-[800px] items-center justify-between py-4">
          <div className="text-lg font-semibold">Finances Simulator</div>
          <nav className="flex gap-4 text-sm">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `rounded px-3 py-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900"}`
              }
              end
            >
              Simulation
            </NavLink>
            <NavLink
              to="/config"
              className={({ isActive }) =>
                `rounded px-3 py-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900"}`
              }
            >
              Config
            </NavLink>
            <NavLink
              to="/help"
              className={({ isActive }) =>
                `rounded px-3 py-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-900"}`
              }
            >
              Help
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-[70%] min-w-[800px] py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/config" element={<ScenarioConfigPage />} />
          <Route path="/config/wizard" element={<ConfigWizard />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </main>
    </div>
  );
}


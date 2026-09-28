import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useApp } from "./lib/state";
import { useEffect } from "react";
import { TokenControl } from "./components/TokenControl";
import { MapPage } from "./pages/MapPage";
import { ReplayPage } from "./pages/ReplayPage";
import { VerifyPage } from "./pages/VerifyPage";
import { AlertsPage } from "./pages/AlertsPage";
import { AboutPage } from "./pages/AboutPage";

const BiasPage = lazy(() => import("./pages/BiasPage").then((m) => ({ default: m.BiasPage })));
const ScorecardPage = lazy(() => import("./pages/ScorecardPage").then((m) => ({ default: m.ScorecardPage })));

const NAV = [
  ["/", "Confidence map"],
  ["/alerts", "Alerts"],
  ["/bias", "Error-prone areas"],
  ["/replay", "Replay"],
  ["/scorecard", "Scorecard"],
  ["/verify", "Verify"],
  ["/about", "Who it's for"],
] as const;

export function App() {
  const { api, recheckApi } = useApp();

  useEffect(() => {
    // Native scrolling used to comply with minimalist aesthetic guidelines.
  }, []);
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Forecast Trust Layer home">
          <span className="brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2.5 11.5l3.5-6 2.5 3.5 3-5.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span>
            <div className="brand-name">Forecast Trust Layer</div>
            <div className="brand-sub">SIH26079 · MoES / NCMRWF</div>
          </span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="pill" onClick={recheckApi} title="Click to re-check">
            <span className={`dot ${api.kind === "online" ? "ok" : api.kind === "offline" ? "bad" : ""}`} />
            {api.kind === "online" ? `API online · ${api.health.model_version ?? "model ?"}` : api.kind === "offline" ? "API offline" : "Checking API…"}
          </button>
          <TokenControl />
        </div>
      </header>
      <main>
        <Suspense fallback={<div className="page muted">Loading…</div>}>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/bias" element={<BiasPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/scorecard" element={<ScorecardPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/privacy" element={<div className="page card card-pad"><h1>Privacy Policy</h1><p>Minimal placeholder for privacy policy.</p></div>} />
          <Route path="/terms" element={<div className="page card card-pad"><h1>Terms & Conditions</h1><p>Minimal placeholder for terms.</p></div>} />
          <Route path="*" element={<div className="page"><h1>Not found</h1></div>} />
        </Routes>
        </Suspense>
      </main>
      <footer className="footer">
        <div>Decision support for forecasters and disaster managers. Official forecasts and warnings are issued by IMD.</div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 16 }}>
          <NavLink to="/privacy">Privacy Policy</NavLink>
          <NavLink to="/terms">Terms & Conditions</NavLink>
        </div>
      </footer>
    </div>
  );
}

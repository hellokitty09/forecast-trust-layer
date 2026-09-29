import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { TokenControl } from "./components/TokenControl";
import { MapPage } from "./pages/MapPage";
import { ReplayPage } from "./pages/ReplayPage";
import { VerifyPage } from "./pages/VerifyPage";
import { AlertsPage } from "./pages/AlertsPage";
import { AboutPage } from "./pages/AboutPage";

const BiasPage = lazy(() => import("./pages/BiasPage").then((m) => ({ default: m.BiasPage })));
const ScorecardPage = lazy(() => import("./pages/ScorecardPage").then((m) => ({ default: m.ScorecardPage })));

const NAV = [
  ["/", "Confidence"],
  ["/alerts", "Alerts"],
  ["/bias", "Bias & skill"],
  ["/replay", "Replay"],
  ["/scorecard", "Scorecard"],
  ["/verify", "Verify"],
  ["/about", "About"],
] as const;

export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <svg className="weather-header-art" viewBox="0 0 620 170" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M122 48c57-35 117-43 178-21 41 15 78 18 123 3 55-18 112-12 174 24" />
            <path d="M83 73c76-35 142-35 204-12 49 18 93 20 142 3 55-20 111-17 173 13" />
            <path d="M68 102c72-23 129-17 188 5 59 22 108 25 163 5 58-21 119-21 183-2" />
            <path d="M114 131c61-15 110-8 160 10 54 20 105 22 158 3 47-17 98-18 149-9" />
            <path d="M248 18l-8 20m37-12-8 20m38-13-8 21m42-13-8 21m42-13-8 22m43-13-8 22m44-12-8 21m45-10-8 19m46-8-8 17" strokeLinecap="round" />
          </g>
        </svg>
        <div className="masthead">
          <NavLink to="/" className="brand" aria-label="Forecast Trust Layer home">
            <span className="brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.3 13.1a4.1 4.1 0 0 1 .8-8.1 5.7 5.7 0 0 1 10.7 1.8 3.3 3.3 0 0 1 .4 6.5H6.3Z" />
                <path d="m8 16-1 2.2m5-2.2-1 2.2m5-2.2-1 2.2" />
              </svg>
            </span>
            <span>
              <div className="brand-name">Forecast Trust Layer</div>
              <div className="brand-sub">SIH26079 <span>·</span> MoES / NCMRWF</div>
            </span>
          </NavLink>
          <div className="topbar-right">
            <span className="pill preview-state" title="This interface currently uses preview data">
              <span className="dot" /> Preview environment
            </span>
            <TokenControl />
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
          ))}
        </nav>
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
        <svg className="weather-footer-art" viewBox="0 0 660 210" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M104 34c64-35 126-33 188-8 48 19 91 22 145 4 58-19 128-17 202 14" />
            <path d="M70 67c73-28 133-23 194 1 58 23 108 27 165 6 62-22 131-19 207 7" />
            <path d="M48 101c78-20 134-11 193 12 62 24 116 25 172 4 64-24 137-19 222 8" />
            <path d="M70 139c66-12 121-2 177 18 64 23 119 21 177-1 65-24 134-18 207 9" />
            <path d="M125 170c56-7 101 3 151 20 57 20 105 16 160-4 54-20 109-16 167 3" />
            <path d="M332 21l-8 20m38-13-8 21m40-13-8 21m43-12-8 21m45-12-8 21m47-11-8 20m49-9-8 18" strokeLinecap="round" />
          </g>
        </svg>
        <div className="footer-inner">
          <div className="footer-brandblock">
            <span className="footer-kicker"><span className="footer-rain-dot" /> SIH26079 · FORECAST TRUST LAYER</span>
            <strong>Weather uncertainty, made easier to read.</strong>
            <p>Decision support for forecasters and disaster managers.</p>
          </div>
          <div className="footer-boundary">
            <span>OFFICIAL WARNING BOUNDARY</span>
            <p>IMD issues official forecasts and warnings. This tool does not issue or suppress them.</p>
          </div>
          <nav className="footer-links" aria-label="Legal links">
            <NavLink to="/privacy">Privacy policy</NavLink>
            <NavLink to="/terms">Terms &amp; conditions</NavLink>
          </nav>
        </div>
        <div className="footer-bottom"><span>MoES / NCMRWF</span></div>
      </footer>
    </div>
  );
}

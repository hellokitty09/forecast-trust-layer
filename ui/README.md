# ui/ — FTL dashboard

Implements **DESIGN.md §12** (UI) on top of the §11 API. React + TypeScript + Vite + MapLibre + ECharts.

```
cd ui && npm install
npm run dev        # http://localhost:5173 (proxies /v1 → :8000; override with FTL_API=...)
npm test           # fail-safe schema tests
npm run build
```

## Pages
| Route | DESIGN §12 | Data source |
|---|---|---|
| `/` | 1 National map + 2 Trust Card panel (incl. Live Bust Watch history) | `GET /v1/map`, `/v1/trust`, `/v1/trust/history`, `/v1/cases/{id}`, `/v1/cap/{id}.xml`; offline fallback `public/offline/map-latest.json` (`make export-offline`) |
| `/alerts` | 7 Alerts (forecaster, SDMA) | `GET /v1/alerts`, `/v1/cap/{id}.xml` |
| `/bias` | 3 Error-prone map + skill-horizon chart (scientist, forecaster) | `GET /v1/bias` |
| `/replay` | 4 Replay | `public/reports/replay/index.json` + `<file>` (static; OPEN_QUESTIONS #8) |
| `/scorecard` | 5 Scorecard (scientist) | `GET /v1/scorecard` |
| `/verify` | 6 Verify + Forecast Black Box | `POST /v1/verify`, `GET /v1/chain`, `GET /v1/keys` |
| `/about` | 8 Who it's for (DESIGN §1A) | — |

Report file schemas: `src/lib/reports.ts`. Card/map schemas: `src/lib/schema.ts`. Pages show an empty state
until those files exist; the UI never computes or invents a metric.

## Rules this module enforces
- **Fail-safe (rule 4):** anything failing schema validation, missing a probability, or out of range renders
  `UNAVAILABLE`. If the server's confidence label disagrees with the §11 bands, the more cautious band wins.
  Unprecedented patterns are capped at LOW. Verify never reports "valid" when the service can't be reached.
- **Illustrative data (rule 1):** the "Illustrative demo" toggle (`?demo=1`) fills the map and Trust Cards with
  placeholder values from `src/api/illustrative.ts`. Every object carries `illustrative: true`; the UI shows a
  banner, a watermark and a stamp. Analogs, scorecard, bias, skill and replay are **never** faked.
- **Boundaries (rule 9):** the default view is a schematic tile grid, not a map. The geographic MapLibre view
  appears only when official boundaries are placed at `public/boundaries/imd_subdivisions.geojson`
  (features need `properties.region_id` matching `src/lib/regions.ts`).
- Confidence bands live in `src/lib/schema.ts` (`CONFIDENCE_BANDS`), mirroring §11. They should come from
  config via the API; see OPEN_QUESTIONS.

## Auth
Trust Cards, alerts, CAP and cases need a role; bias needs `scientist` or `forecaster`; the scorecard needs `scientist`.
Click **Sign in** in the header and paste a token from `make token ROLE=forecaster` (or `sdma`, `scientist`). The token is kept in `sessionStorage` for that tab only. Signed out,
the map shows the public tier, where probabilities are rounded up.

## Offline bundle format
`public/offline/map-latest.json`: `{ "init_time": "...Z", "maps": { "rain:1": <GeoJSON from /v1/map>, ... } }`.

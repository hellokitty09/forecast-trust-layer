// DESIGN §1A — who FTL is for and why. Text only; no numbers.
import { NavLink } from "react-router-dom";

const USERS = [
  {
    who: "Duty forecaster",
    where: "NCMRWF operations, IMD national and regional centres — each model cycle",
    decides: "Warning colour and wording (\"likely\" vs \"very likely\"), and whether to hold a warning until the next run.",
    gets: "Where and when not to trust the forecast, why, and what to do about it, with similar past cases.",
    views: [["/", "Confidence map"], ["/alerts", "Alerts"]],
    tag: "Primary",
  },
  {
    who: "Model developer / verification scientist",
    where: "NCMRWF model development",
    decides: "Which regions, seasons, systems and lead times to fix first, and whether a model upgrade helped.",
    gets: "Error-prone (bias) map, skill horizon, per-system scorecard with event counts, and replays.",
    views: [["/bias", "Error-prone areas"], ["/scorecard", "Scorecard"], ["/replay", "Replay"]],
    tag: "Primary",
  },
  {
    who: "Disaster manager",
    where: "NDMA / SDMAs / district control rooms, 2–7 days ahead",
    decides: "How early and how much to pre-position: response teams, evacuation readiness, dam releases.",
    gets: "Warnings that carry confidence and a trust horizon (CAP), and when to re-check after the next run.",
    views: [["/alerts", "Alerts + CAP"]],
    tag: "Secondary",
  },
  {
    who: "Sector advisory services",
    where: "Agromet, reservoir / hydropower, power-grid planning — through IMD, not directly",
    decides: "Weekly advisories: sowing, spraying, irrigation, water release, load planning.",
    gets: "A confidence qualifier carried through IMD products.",
    views: [],
    tag: "Downstream",
  },
] as const;

const VALUE = [
  ["Duty forecaster", "Saves time (flags the few risky region-days out of hundreds), gives a defensible reason, catches busts earlier via live cycle updates.", "Fewer high-confidence warnings that bust; lead time at which risk is flagged; time to review a cycle."],
  ["Model developer", "Links model errors to weather systems and physical causes (bias vs start vs chaos).", "Bias and skill maps reproduce known problem areas; upgrade impact visible per system."],
  ["Disaster manager", "Can match response scale to forecast reliability, reducing costly false mobilisations and missed events.", "Relative Economic Value curve (cost–loss) above baseline."],
  ["Downstream sectors", "Risk-qualified advice instead of a single forecast with no risk qualifier.", "Adoption of the confidence field in IMD advisories (future)."],
] as const;

const DAY = [
  ["05:30 IST", "The 00 UTC run is initialised. FTL scores it within minutes and signs the Trust Cards."],
  ["Morning", "Forecaster opens the national map: most regions green; Odisha Day 4–6 rain LOW, Error Anatomy 55% chaos, reason “LPS track spread over central India”, 7 of 11 similar cases busted."],
  ["Morning", "Forecaster keeps the Odisha heavy-rain alert at orange instead of red, writes “likely”, notes “re-check at 12 UTC run”."],
  ["17:30 IST", "The 12 UTC run arrives. Live Bust Watch shows the run-to-run jump shrinking; confidence rises to MEDIUM. Forecaster upgrades the alert."],
  ["Same evening", "The CAP alert to SDMAs carries forecastConfidence=MEDIUM, trustHorizonDay=5. The SDMA pre-positions teams in the two most exposed districts only."],
  ["After the event", "The verification scientist opens the replay: the card, its signature and the audit chain show exactly what was said and when."],
] as const;

const ROLES = [
  ["public", "Anyone", "Rounded national confidence map, verify page"],
  ["sdma", "NDMA / SDMA / district officials", "Confidence map, alerts, CAP"],
  ["forecaster", "NCMRWF / IMD forecasters", "Everything above + full Trust Cards, analog cases, feedback"],
  ["scientist", "NCMRWF model developers", "Bias maps, scorecards, bust archive, replay"],
  ["admin", "System operators", "Configuration, keys, deployments (MFA)"],
] as const;

export function AboutPage() {
  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="page-head">
        <div>
          <h1>Who this is for</h1>
          <p>
            A medium-range forecast arrives as one map per day, with no statement of how far to trust it. Forecasters
            judge that by eye, and the judgement is never recorded or passed on. Forecast Trust Layer turns it into an
            objective, recorded trust signal for every region and day, with a reason, at the moment the decision is
            made.
          </p>
        </div>
      </div>

      <blockquote className="usp">
        We don't predict the weather better — we tell the forecaster when the existing forecast should{" "}
        <b>NOT</b> be trusted, how likely it is to bust, how uncertain it is, and why.
      </blockquote>

      <div style={{ display: "grid", gap: 12 }}>
        {USERS.map((u) => (
          <section className="card card-pad" key={u.who} style={{ display: "grid", gap: 6 }}>
            <div className="tc-row">
              <h2>{u.who}</h2>
              <span className={`tag${u.tag === "Primary" ? " warn" : ""}`}>{u.tag.toUpperCase()}</span>
            </div>
            <div className="faint">{u.where}</div>
            <dl className="kv" style={{ gridTemplateColumns: "140px 1fr" }}>
              <dt>Decides</dt><dd style={{ textAlign: "left" }}>{u.decides}</dd>
              <dt>FTL gives</dt><dd style={{ textAlign: "left" }}>{u.gets}</dd>
            </dl>
            {u.views.length > 0 && (
              <div className="tc-actions">
                {u.views.map(([to, label]) => <NavLink key={to} className="btn" to={to}>{label}</NavLink>)}
              </div>
            )}
          </section>
        ))}

        <section className="card card-pad">
          <h2 style={{ marginBottom: 10 }}>Why each user will use it</h2>
          <table className="tbl">
            <thead><tr><th>User</th><th>Reason to adopt</th><th>Value measure</th></tr></thead>
            <tbody>
              {VALUE.map(([who, reason, measure]) => (
                <tr key={who}><td>{who}</td><td>{reason}</td><td className="muted">{measure}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card card-pad">
          <h2 style={{ marginBottom: 10 }}>A day in the life (primary user)</h2>
          <ol className="timeline">
            {DAY.map(([when, what], i) => (
              <li key={i}>
                <span className="t-dot" style={{ background: "var(--accent)" }} />
                <div><b>{when}</b><div className="muted">{what}</div></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card card-pad" style={{ borderColor: "var(--c-medium)" }}>
          <h2>Not a user: the general public</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            The public view is only a rounded, read-only confidence map. Public weather communication stays with IMD.
            FTL is decision support: it never issues or suppresses an official warning.
          </p>
        </section>

        <section className="card card-pad">
          <h2 style={{ marginBottom: 10 }}>Roles</h2>
          <table className="tbl">
            <thead><tr><th>Role</th><th>Who</th><th>Can</th></tr></thead>
            <tbody>
              {ROLES.map(([r, who, can]) => <tr key={r}><td className="mono">{r}</td><td>{who}</td><td>{can}</td></tr>)}
            </tbody>
          </table>
        </section>

        <section className="card card-pad">
          <h2 style={{ marginBottom: 6 }}>What you can check yourself</h2>
          <ul className="reasons">
            <li><b>Forecast Black Box</b>: every Trust Card is signed and hash-chained. Anyone can check a card on the <NavLink to="/verify">Verify</NavLink> page.</li>
            <li><b>Live Bust Watch</b>: when a newer cycle changes a verdict, the card is re-issued, and its history shows what changed, when and why.</li>
            <li><b>Fail-safe</b>: missing or invalid input shows as <i>Unavailable</i>, never as high confidence.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

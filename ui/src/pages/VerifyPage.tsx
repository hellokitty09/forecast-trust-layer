import { useState } from "react";
import { getChain, getKeys, verifyCard, type VerifyResult } from "../api/client";
import { useAsync } from "../lib/useAsync";
import { parseCard } from "../lib/schema";

type Verdict =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "bad-json"; msg: string }
  | { kind: "unknown"; msg: string }
  | { kind: "done"; r: VerifyResult; schemaNote?: string };

export function VerifyPage() {
  const [text, setText] = useState("");
  const [v, setV] = useState<Verdict>({ kind: "idle" });

  const run = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return setV({ kind: "bad-json", msg: e instanceof Error ? e.message : "invalid JSON" });
    }
    const schema = parseCard(parsed);
    setV({ kind: "checking" });
    try {
      const r = await verifyCard(parsed);
      setV({ kind: "done", r, schemaNote: schema.ok ? undefined : schema.error });
    } catch (e) {
      setV({ kind: "unknown", msg: e instanceof Error ? e.message : "verification service unreachable" });
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return setV({ kind: "bad-json", msg: "File larger than 1 MB - not a Trust Card." });
    f.text().then(setText);
  };

  return (
    <div className="page verify-page">
      <div className="page-head">
        <div>
          <h1>Verify a Trust Card</h1>
          <p>
            Verification controls are shown for the prototype workflow. This preview has no signing service connected,
            so it cannot confirm a card as authentic or unchanged.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card card-pad" style={{ display: "grid", gap: 10 }}>
          <textarea
            className="verify-in"
            placeholder={'{"card_id": "…", "signature": "ed25519:…", …}'}
            value={text}
            onChange={(e) => { setText(e.target.value); setV({ kind: "idle" }); }}
            spellCheck={false}
            aria-label="Trust Card JSON"
          />
          <div className="tc-actions">
            <button className="btn primary" onClick={run} disabled={!text.trim() || v.kind === "checking"}>
              {v.kind === "checking" ? "Verifying…" : "Verify"}
            </button>
            <label className="btn">
              Upload .json
              <input type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </section>
        <section className="card card-pad" style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <h2>Result</h2>
          <VerdictView v={v} />
        </section>
      </div>
      <BlackBox />
    </div>
  );
}

function BlackBox() {
  const chain = useAsync(getChain, []);
  const keys = useAsync(getKeys, []);
  return (
    <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <div className="tc-row">
        <h2>Forecast Black Box</h2>
        {chain.kind === "ok" && (
          <span className={`sig ${chain.value.chain_intact && chain.value.audit_intact ? "valid" : "bad"}`}>
            {chain.value.chain_intact && chain.value.audit_intact ? "✓ Record intact" : "✕ Record broken"}
          </span>
        )}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Every Trust Card is signed and linked to the one before it. Editing, deleting or reordering any past card
        breaks the chain, and the break shows here.
      </p>
      {chain.kind === "loading" && <div className="muted">Checking…</div>}
      {chain.kind === "error" && <div className="muted">Chain status unavailable ({chain.msg}). Nothing is confirmed intact.</div>}
      {chain.kind === "ok" && (
        <dl className="kv">
          <dt>Cards in chain</dt><dd className="num">{chain.value.cards_in_chain}</dd>
          <dt>Card chain</dt><dd>{chain.value.chain_detail}</dd>
          <dt>Rejected cards</dt><dd className="num">{chain.value.cards_rejected}</dd>
          <dt>Audit log</dt><dd>{chain.value.audit_detail}</dd>
          <dt>Head hash</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{chain.value.head_hash}</dd>
        </dl>
      )}
      {keys.kind === "ok" && keys.value.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 6 }}>Published verification keys (Ed25519)</h3>
          <dl className="kv">
            {keys.value.map((k) => (
              <div key={k.key_id} style={{ display: "contents" }}>
                <dt className="mono">{k.key_id}{k.current ? " (current)" : ""}</dt>
                <dd className="mono" style={{ wordBreak: "break-all" }}>{k.public_key}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function VerdictView({ v }: { v: Verdict }) {
  if (v.kind === "idle") return (
    <div className="verify-idle">
      <svg className="verify-idle-art" viewBox="0 0 120 76" fill="none" aria-hidden="true">
        <path d="M25 15.5h46a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H25a6 6 0 0 1-6-6v-42a6 6 0 0 1 6-6Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M31 28h31M31 37h24M31 46h17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="82" cy="47" r="20" fill="#f4f3ed" stroke="currentColor" strokeWidth="1.5" />
        <path d="M75 47.5 80 52l9-10" stroke="#176b65" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M69 15c8-7 17-9 27-6m-24 9c8-5 16-5 24-2" stroke="#c58b54" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <strong>No card checked yet</strong>
      <p>Paste or upload a Trust Card above to inspect its signature and history chain.</p>
      <div className="verify-steps" aria-label="Verification steps"><span>Trust Card</span><i /><span>Signature</span><i /><span>History chain</span></div>
    </div>
  );
  if (v.kind === "checking") return <p className="muted" style={{ margin: 0 }}>Checking signature and chain…</p>;
  if (v.kind === "bad-json")
    return <Box cls="tampered" icon="!" color="var(--c-low)" title="Not a readable Trust Card" body={v.msg} />;
  if (v.kind === "unknown")
    return <Box cls="unknown" icon="?" color="var(--c-noskill)" title="Could not verify" body={`The verification service is unavailable (${v.msg}). The card is NOT confirmed as valid.`} />;
  const { r } = v;
  return (
    <>
      {r.valid ? (
        <Box cls="valid" icon="✓" color="var(--c-high)" title="Valid" body="Signature and hash chain check out. This card is authentic and unaltered." />
      ) : (
        <Box cls="tampered" icon="✕" color="var(--c-low)" title="Tampered or not issued by FTL" body={r.detail ?? "Signature or hash-chain check failed. Do not rely on this card."} />
      )}
      <dl className="kv">
        <dt>Signature</dt><dd>{r.signature_valid == null ? "-" : r.signature_valid ? "valid" : "invalid"}</dd>
        <dt>Hash chain</dt><dd>{r.chain_valid == null ? "-" : r.chain_valid ? "valid" : "broken"}</dd>
      </dl>
      {v.schemaNote && <div className="tag warn" style={{ whiteSpace: "normal" }}>Schema warning: {v.schemaNote}</div>}
    </>
  );
}

function Box({ cls, icon, color, title, body }: { cls: string; icon: string; color: string; title: string; body: string }) {
  return (
    <div className={`verdict ${cls}`}>
      <div className="icon" style={{ background: color }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        <div className="muted">{body}</div>
      </div>
    </div>
  );
}

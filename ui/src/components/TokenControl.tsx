import { useState } from "react";
import { useApp } from "../lib/state";

export function TokenControl() {
  const { token, role, setToken } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (token) {
    return (
      <span className="pill">
        Signed in · {role ?? "unreadable token"}
        <button className="linkish" onClick={() => setToken(null)}>Sign out</button>
      </span>
    );
  }
  if (!editing) {
    return <button className="pill" onClick={() => setEditing(true)}>Sign in</button>;
  }
  return (
    <form
      className="token-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) setToken(draft.trim());
        setDraft("");
        setEditing(false);
      }}
    >
      <input
        type="password"
        autoFocus
        placeholder="Paste access token (make token ROLE=forecaster)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Access token"
        autoComplete="off"
      />
      <button className="btn primary" type="submit">Use</button>
      <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getHealth, getToken, setToken as storeToken, type Health } from "../api/client";
import { decodeRole, type Role } from "./auth";
import type { Variable } from "./schema";

function latestInit00Z(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
}

export type ApiState = { kind: "checking" } | { kind: "online"; health: Health } | { kind: "offline"; reason: string };

interface AppState {
  init: string;
  setInit: (s: string) => void;
  lead: number;
  setLead: (n: number) => void;
  variable: Variable;
  setVariable: (v: Variable) => void;
  api: ApiState;
  recheckApi: () => void;
  token: string | null;
  setToken: (t: string | null) => void;
  /** Decoded from the token, for UI display/gating only — the server is the real enforcement point. */
  role: Role | null;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [init, setInit] = useState(latestInit00Z);
  const [lead, setLead] = useState(1);
  const [variable, setVariable] = useState<Variable>("rain");
  const [api, setApi] = useState<ApiState>({ kind: "checking" });
  const [token, setTokenRaw] = useState<string | null>(getToken);
  const setToken = useCallback((t: string | null) => {
    storeToken(t);
    setTokenRaw(t);
  }, []);

  const recheckApi = useCallback(() => {
    setApi({ kind: "checking" });
    getHealth()
      .then((health) => setApi({ kind: "online", health }))
      .catch((e: unknown) => setApi({ kind: "offline", reason: e instanceof Error ? e.message : "unreachable" }));
  }, []);

  useEffect(recheckApi, [recheckApi]);

  const role = useMemo(() => decodeRole(token), [token]);

  const value = useMemo(
    () => ({ init, setInit, lead, setLead, variable, setVariable, api, recheckApi, token, setToken, role }),
    [init, lead, variable, api, recheckApi, token, setToken, role],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppStateProvider");
  return v;
}

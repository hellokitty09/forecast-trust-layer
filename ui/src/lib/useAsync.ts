import { useEffect, useState, type DependencyList } from "react";

export type Async<T> = { kind: "loading" } | { kind: "error"; msg: string; status?: number } | { kind: "ok"; value: T };

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): Async<T> {
  const [s, setS] = useState<Async<T>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    setS({ kind: "loading" });
    fn()
      .then((value) => live && setS({ kind: "ok", value }))
      .catch((e: unknown) => {
        if (!live) return;
        const status = (e as { status?: number })?.status;
        setS({ kind: "error", msg: e instanceof Error ? e.message : "failed", status });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}

import type { ReactNode } from "react";

export function EmptyState({ title, children, command }: { title: string; children?: ReactNode; command?: string }) {
  return (
    <div className="empty">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M13 22l5-7 4 5 5-7" stroke="var(--ink-3)" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {command && <pre className="mono">{command}</pre>}
    </div>
  );
}

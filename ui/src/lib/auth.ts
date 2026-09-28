// Client-side JWT role decode — for UI display/gating only. The server (src/ftl/serve/auth.py)
// is the real enforcement point; nothing here is a security boundary.
export const ROLES = ["public", "sdma", "forecaster", "scientist", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function decodeRole(token: string | null): Role | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
    return ROLES.includes(payload.role as Role) ? (payload.role as Role) : null;
  } catch {
    return null;
  }
}

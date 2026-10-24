export type SessionMember = {
  id: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  disabled: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  lastSeenAt: number | null;
  online: boolean;
};

export const HEARTBEAT_MS = 60_000;

export function loginUrl(): string {
  const next = window.location.pathname + window.location.search;
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

let redirecting = false;
function goToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  window.location.assign(loginUrl());
}

/**
 * Any /api/* call that answers 401 means the session expired or was revoked
 * (password reset, deactivation) → back to the login page.
 */
export function installAuthRedirect(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    if (res.status === 401) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const path = new URL(url, window.location.href).pathname;
      if (path.startsWith("/api/") && path !== "/api/auth/login") goToLogin();
    }
    return res;
  };
}

export async function fetchMe(): Promise<SessionMember | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { ok?: boolean; member?: SessionMember };
  return data.ok && data.member ? data.member : null;
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } finally {
    window.location.assign("/login");
  }
}

/** Presence ping every ~60 s while the tab is open (+ when it becomes visible). */
export function startHeartbeat(): () => void {
  const ping = () => {
    if (document.visibilityState === "hidden") return;
    void fetch("/api/auth/heartbeat", {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
  };
  const timer = window.setInterval(ping, HEARTBEAT_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") ping();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function memberLabel(m: Pick<SessionMember, "username" | "displayName">): string {
  return m.displayName?.trim() || m.username;
}

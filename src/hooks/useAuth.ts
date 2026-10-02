import { useCallback, useEffect, useState } from "react";

export type AuthUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
};

export type AuthState = {
  loading: boolean;
  authenticated: boolean;
  canEdit: boolean;
  discordConfigured: boolean;
  roleGateConfigured: boolean;
  user: AuthUser | null;
  error: string | null;
};

const initial: AuthState = {
  loading: true,
  authenticated: false,
  canEdit: false,
  discordConfigured: false,
  roleGateConfigured: false,
  user: null,
  error: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        canEdit?: boolean;
        discordConfigured?: boolean;
        roleGateConfigured?: boolean;
        user?: AuthUser | null;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setState({
          ...initial,
          loading: false,
          error: data.error ?? `Auth check failed (${res.status}).`,
        });
        return;
      }
      setState({
        loading: false,
        authenticated: Boolean(data.authenticated),
        canEdit: Boolean(data.canEdit),
        discordConfigured: Boolean(data.discordConfigured),
        roleGateConfigured: Boolean(data.roleGateConfigured),
        user: data.user ?? null,
        error: null,
      });
    } catch {
      setState({
        ...initial,
        loading: false,
        error: "Could not reach /api/me. Is the API running?",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    await refresh();
  }, [refresh]);

  return { ...state, refresh, logout };
}

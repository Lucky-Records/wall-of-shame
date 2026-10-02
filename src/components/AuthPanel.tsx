import type { AuthState } from "../hooks/useAuth";

type AuthPanelProps = Pick<
  AuthState,
  | "loading"
  | "authenticated"
  | "canEdit"
  | "discordConfigured"
  | "roleGateConfigured"
  | "user"
  | "error"
> & {
  onLogout: () => void;
};

export function AuthPanel({
  loading,
  authenticated,
  canEdit,
  discordConfigured,
  roleGateConfigured,
  user,
  error,
  onLogout,
}: AuthPanelProps) {
  if (loading) {
    return (
      <section className="panel auth-panel">
        <p className="hint">Discord-Sitzung wird geprüft…</p>
      </section>
    );
  }

  return (
    <section className="panel auth-panel">
      <h2>Zugang</h2>
      {!discordConfigured ? (
        <p className="demo-banner" role="status">
          <strong>Discord-OAuth nicht konfiguriert.</strong> Setze{" "}
          <code>DISCORD_CLIENT_ID</code>, <code>DISCORD_CLIENT_SECRET</code> und{" "}
          <code>SESSION_SECRET</code> (siehe README). Öffentliche Ansicht geht trotzdem.
        </p>
      ) : null}

      {authenticated && user ? (
        <div className="auth-user">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" width={36} height={36} />
          ) : (
            <span className="auth-avatar-fallback" aria-hidden>
              {(user.globalName || user.username).slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="auth-user-meta">
            <strong>{user.globalName || user.username}</strong>
            <span className={`role-pill ${canEdit ? "editor" : "viewer"}`}>
              {canEdit ? "Editor" : "Nur Ansicht"}
            </span>
          </div>
          <button type="button" className="btn ghost" onClick={onLogout}>
            Abmelden
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="hint">
            Jeder kann das Netzwerk sehen. Bearbeiten braucht Discord-Login und
            die konfigurierte Editor-Rolle.
          </p>
          <a
            className={`btn primary discord-btn${!discordConfigured ? " disabled" : ""}`}
            href={discordConfigured ? "/api/auth/discord" : undefined}
            aria-disabled={!discordConfigured}
            onClick={(e) => {
              if (!discordConfigured) e.preventDefault();
            }}
          >
            Mit Discord anmelden
          </a>
          {discordConfigured && !roleGateConfigured ? (
            <p className="hint">
              Rollen-Gate fehlt noch — <code>DISCORD_GUILD_ID</code> und{" "}
              <code>DISCORD_EDITOR_ROLE_ID</code> setzen, damit Editoren geprüft werden.
            </p>
          ) : null}
        </div>
      )}

      {authenticated && !canEdit ? (
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          Du bist angemeldet, hast aber nicht die Editor-Rolle auf dem
          konfigurierten Server.
        </p>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

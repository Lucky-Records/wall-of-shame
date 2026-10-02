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
        <p className="hint">Checking Discord session…</p>
      </section>
    );
  }

  return (
    <section className="panel auth-panel">
      <h2>Access</h2>
      {!discordConfigured ? (
        <p className="demo-banner" role="status">
          <strong>Discord OAuth not configured.</strong> Set{" "}
          <code>DISCORD_CLIENT_ID</code>, <code>DISCORD_CLIENT_SECRET</code>, and{" "}
          <code>SESSION_SECRET</code> (see README). Public viewing still works.
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
              {canEdit ? "Editor" : "View only"}
            </span>
          </div>
          <button type="button" className="btn ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="hint">
            Anyone can view the network. Editing requires Discord sign-in and
            the configured editor role.
          </p>
          <a
            className={`btn primary discord-btn${!discordConfigured ? " disabled" : ""}`}
            href={discordConfigured ? "/api/auth/discord" : undefined}
            aria-disabled={!discordConfigured}
            onClick={(e) => {
              if (!discordConfigured) e.preventDefault();
            }}
          >
            Sign in with Discord
          </a>
          {discordConfigured && !roleGateConfigured ? (
            <p className="hint">
              Role gate not set yet — add <code>DISCORD_GUILD_ID</code> and{" "}
              <code>DISCORD_EDITOR_ROLE_ID</code> so editors can be verified.
            </p>
          ) : null}
        </div>
      )}

      {authenticated && !canEdit ? (
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          You are signed in but do not have the editor role in the configured
          guild.
        </p>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

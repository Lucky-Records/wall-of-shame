import { StrictMode, useCallback, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./pages.css";
import {
  fetchMe,
  installAuthRedirect,
  logout,
  memberLabel,
  startHeartbeat,
  type SessionMember,
} from "./lib/session";

installAuthRedirect();

type LoginEvent = {
  id: number;
  memberId: number | null;
  username: string;
  displayName: string | null;
  at: number;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
};

const TZ = "Europe/Zurich";
const dateFmt = new Intl.DateTimeFormat("de-CH", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatTime(ms: number | null): string {
  return ms ? dateFmt.format(new Date(ms)) : "–";
}

function relative(ms: number | null, now: number): string {
  if (!ms) return "nie";
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? "vor 1 Tag" : `vor ${d} Tagen`;
}

function shortAgent(ua: string | null): string {
  if (!ua) return "–";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl/i.test(ua)
              ? "curl"
              : "Andere";
  return os ? `${browser} · ${os}` : browser;
}

const PW_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_!?";
function generatePassword(length = 16): string {
  const out: string[] = [];
  const limit = 256 - (256 % PW_ALPHABET.length);
  while (out.length < length) {
    const buf = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of buf) {
      if (b < limit && out.length < length) out.push(PW_ALPHABET[b % PW_ALPHABET.length]!);
    }
  }
  return out.join("");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? `Fehler (${res.status}).`);
  }
  return data;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost btn-sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Kopiert ✓" : "Kopieren"}
    </button>
  );
}

function CreateMemberForm({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(
    null,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/members", {
        method: "POST",
        body: JSON.stringify({ username, displayName, password, isAdmin }),
      });
      setCreated({ username, password });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setIsAdmin(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel admin-panel">
      <h2>Neues Mitglied</h2>
      <form className="admin-form" onSubmit={(e) => void submit(e)}>
        <label>
          Benutzername
          <input
            name="new-username"
            required
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="z. B. NeonFox"
          />
        </label>
        <label>
          Anzeigename (optional)
          <input
            name="new-display-name"
            autoComplete="off"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="admin-pw-field">
          Passwort
          <span className="admin-pw-row">
            <input
              name="new-password"
              required
              autoComplete="new-password"
              value={password}
              minLength={10}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mind. 10 Zeichen"
            />
            <button
              type="button"
              className="btn ghost"
              onClick={() => setPassword(generatePassword())}
            >
              Passwort generieren
            </button>
          </span>
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin-Rechte
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Wird angelegt…" : "Mitglied anlegen"}
        </button>
      </form>
      {error ? <p className="auth-error">{error}</p> : null}
      {created ? (
        <div className="admin-created" role="status">
          <p>
            <strong>{created.username}</strong> wurde angelegt. Zugangsdaten jetzt
            weitergeben – das Passwort wird nicht nochmal angezeigt:
          </p>
          <code className="admin-secret">{created.password}</code>
          <span className="admin-created-actions">
            <CopyButton
              text={`Benutzername: ${created.username}\nPasswort: ${created.password}\n${window.location.origin}/login`}
            />
            <button type="button" className="btn ghost btn-sm" onClick={() => setCreated(null)}>
              Ausblenden
            </button>
          </span>
        </div>
      ) : null}
    </section>
  );
}

function MemberRow({
  member,
  me,
  now,
  onChanged,
  onError,
}: {
  member: SessionMember;
  me: SessionMember;
  now: number;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [savedPw, setSavedPw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isMe = member.id === me.id;

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onChanged();
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Mitglied „${member.username}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/admin/members/${member.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const status = member.disabled
    ? { cls: "is-disabled", text: "Deaktiviert" }
    : member.online
      ? { cls: "is-online", text: "Online" }
      : { cls: "is-offline", text: "Offline" };

  return (
    <>
      <tr data-member={member.username} className={member.disabled ? "row-disabled" : undefined}>
        <td>
          <span className="member-cell">
            <strong>{memberLabel(member)}</strong>
            {member.displayName ? <span className="muted">@{member.username}</span> : null}
            {member.isAdmin ? <span className="badge-admin">Admin</span> : null}
            {isMe ? <span className="muted">(du)</span> : null}
          </span>
        </td>
        <td>
          <span className={`presence ${status.cls}`}>
            <span className="presence-dot" aria-hidden="true" />
            {status.text}
          </span>
        </td>
        <td title={formatTime(member.lastLoginAt)}>
          {formatTime(member.lastLoginAt)}
        </td>
        <td title={formatTime(member.lastSeenAt)}>
          {member.lastSeenAt ? (
            <>
              {relative(member.lastSeenAt, now)}
              <span className="muted small"> · {formatTime(member.lastSeenAt)}</span>
            </>
          ) : (
            "nie"
          )}
        </td>
        <td>
          <span className="row-actions">
            <button
              type="button"
              className="btn ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setResetOpen((v) => !v);
                setSavedPw(null);
                setNewPw("");
              }}
            >
              Passwort zurücksetzen
            </button>
            {isMe ? null : (
              <button
                type="button"
                className="btn ghost btn-sm"
                disabled={busy}
                onClick={() => void patch({ disabled: !member.disabled })}
              >
                {member.disabled ? "Aktivieren" : "Deaktivieren"}
              </button>
            )}
            {isMe ? null : (
              <button
                type="button"
                className="btn danger btn-sm"
                disabled={busy}
                onClick={() => void remove()}
              >
                Löschen
              </button>
            )}
          </span>
        </td>
      </tr>
      {resetOpen ? (
        <tr className="reset-row">
          <td colSpan={5}>
            {savedPw ? (
              <div className="admin-created">
                <p>
                  Neues Passwort für <strong>{member.username}</strong> gespeichert
                  (alle bisherigen Sitzungen wurden abgemeldet):
                </p>
                <code className="admin-secret">{savedPw}</code>
                <span className="admin-created-actions">
                  <CopyButton text={savedPw} />
                  <button
                    type="button"
                    className="btn ghost btn-sm"
                    onClick={() => setResetOpen(false)}
                  >
                    Schliessen
                  </button>
                </span>
              </div>
            ) : (
              <form
                className="admin-reset"
                onSubmit={(e) => {
                  e.preventDefault();
                  const pw = newPw;
                  void patch({ password: pw }).then((ok) => {
                    if (ok) setSavedPw(pw);
                  });
                }}
              >
                <input
                  aria-label={`Neues Passwort für ${member.username}`}
                  autoComplete="new-password"
                  minLength={10}
                  required
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Neues Passwort (mind. 10 Zeichen)"
                />
                <button
                  type="button"
                  className="btn ghost btn-sm"
                  onClick={() => setNewPw(generatePassword())}
                >
                  Passwort generieren
                </button>
                <button type="submit" className="btn primary btn-sm" disabled={busy}>
                  Speichern
                </button>
                <button
                  type="button"
                  className="btn ghost btn-sm"
                  onClick={() => setResetOpen(false)}
                >
                  Abbrechen
                </button>
              </form>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AdminPage() {
  const [me, setMe] = useState<SessionMember | null>(null);
  const [members, setMembers] = useState<SessionMember[]>([]);
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([
        api<{ members: SessionMember[]; now: number }>("/api/admin/members"),
        api<{ events: LoginEvent[] }>("/api/admin/logins?limit=200"),
      ]);
      setMembers(m.members);
      setEvents(l.events);
      setNow(m.now);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void fetchMe().then((m) => {
      if (!m) return;
      if (!m.isAdmin) {
        window.location.assign("/");
        return;
      }
      setMe(m);
    });
    void reload();
    const stopHeartbeat = startHeartbeat();
    const timer = window.setInterval(() => void reload(), 30_000);
    return () => {
      stopHeartbeat();
      window.clearInterval(timer);
    };
  }, [reload]);

  const onlineCount = members.filter((m) => m.online).length;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Lucky · Admin</p>
          <h1>The Wall of Shame – Mitglieder</h1>
        </div>
        <div className="admin-header-actions">
          <a className="btn ghost" href="/">
            ← Zum Board
          </a>
          {me ? <span className="admin-me">Angemeldet als {memberLabel(me)}</span> : null}
          <button type="button" className="btn ghost" onClick={() => void logout()}>
            Abmelden
          </button>
        </div>
      </header>

      {error ? (
        <p className="auth-error admin-error" role="alert">
          {error}{" "}
          <button type="button" className="btn ghost btn-sm" onClick={() => setError(null)}>
            OK
          </button>
        </p>
      ) : null}

      <div className="admin-grid">
        {me ? <CreateMemberForm onCreated={() => void reload()} /> : null}

        <section className="panel admin-panel admin-members">
          <div className="admin-panel-head">
            <h2>Mitglieder ({members.length})</h2>
            <span className="muted small">
              {onlineCount} online · aktualisiert{" "}
              {updatedAt ? formatTime(updatedAt).split(" ")[1] : "–"}
              <button type="button" className="btn ghost btn-sm" onClick={() => void reload()}>
                Aktualisieren
              </button>
            </span>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Letzter Login</th>
                  <th>Zuletzt gesehen</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {me
                  ? members.map((m) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        me={me}
                        now={now}
                        onChanged={() => void reload()}
                        onError={setError}
                      />
                    ))
                  : null}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Online = in den letzten 2 Minuten aktiv. Zeiten in Europe/Zurich.
          </p>
        </section>

        <section className="panel admin-panel admin-log">
          <h2>Login-Protokoll</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Benutzer</th>
                  <th>Ergebnis</th>
                  <th>IP</th>
                  <th>Gerät</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} data-login-event={e.success ? "ok" : "fail"}>
                    <td>{formatTime(e.at)}</td>
                    <td>
                      {e.displayName ?? e.username}
                      {e.memberId === null ? (
                        <span className="muted small"> (unbekannt/gelöscht)</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={e.success ? "result-ok" : "result-fail"}>
                        {e.success ? "Erfolgreich" : "Fehlgeschlagen"}
                      </span>
                    </td>
                    <td className="mono">{e.ip ?? "–"}</td>
                    <td title={e.userAgent ?? undefined}>{shortAgent(e.userAgent)}</td>
                  </tr>
                ))}
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Noch keine Anmeldungen.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminPage />
  </StrictMode>,
);

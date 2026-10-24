import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./pages.css";

function safeNext(): string {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw.startsWith("/login") ? "/" : raw;
}

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Anmeldung fehlgeschlagen (${res.status}).`);
        setPassword("");
        return;
      }
      window.location.assign(safeNext());
    } catch {
      setError("Server nicht erreichbar. Bitte später nochmal versuchen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(e) => void submit(e)}>
        <p className="eyebrow">Lucky · nur für Member</p>
        <h1>The Wall of Shame</h1>
        <p className="auth-sub">Bitte melde dich mit deinem Member-Zugang an.</p>
        <label className="auth-field">
          <span>Benutzername</span>
          <input
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="auth-field">
          <span>Passwort</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn primary auth-submit" disabled={busy}>
          {busy ? "Anmelden…" : "Anmelden"}
        </button>
        <p className="auth-foot">
          Noch keinen Zugang? Frag Lucky nach Benutzername und Passwort.
        </p>
      </form>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoginPage />
  </StrictMode>,
);

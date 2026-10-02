import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Category, Person } from "../types";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "../types";
import {
  defaultCategoryForPlatform,
  fetchTwitchReady,
  resolveProfileFromUrl,
} from "../utils/resolveProfile";

interface SidebarProps {
  people: Person[];
  connectFromId: string | null;
  canEdit: boolean;
  onAddPerson: (person: Omit<Person, "id">) => void;
  onUpdateCategory: (personId: string, category: Category) => void;
  onDeletePerson: (personId: string) => void;
  onStartConnect: (personId: string | null) => void;
  onCreateConnection: (sourceId: string, targetId: string) => void;
  statusMessage: string | null;
}

type PreviewPerson = Omit<Person, "id" | "category"> & {
  demo?: boolean;
};

const CATEGORY_LABELS: Record<Category, string> = {
  Streamer: "Streamer",
  Mod: "Mod",
  Bubble: "Bubble",
};

function platformLabel(platform: Person["platform"]): string {
  if (platform === "twitch") return "Twitch";
  if (platform === "twitter") return "Twitter";
  if (platform === "x") return "X";
  return "Profil";
}

export function Sidebar({
  people,
  connectFromId,
  canEdit,
  onAddPerson,
  onUpdateCategory,
  onDeletePerson,
  onStartConnect,
  onCreateConnection,
  statusMessage,
}: SidebarProps) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("Streamer");
  const [error, setError] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState("");
  const [resolving, setResolving] = useState(false);
  const [preview, setPreview] = useState<PreviewPerson | null>(null);
  const [twitchReady, setTwitchReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTwitchReady().then((ready) => {
      if (!cancelled) setTwitchReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canEdit) {
      onStartConnect(null);
      setConnectTarget("");
      setPreview(null);
      setError(null);
      setUrl("");
    }
  }, [canEdit, onStartConnect]);

  const peopleSorted = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const connectFrom = people.find((p) => p.id === connectFromId) ?? null;
  const fieldsDisabled = !canEdit || resolving;

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    setPreview(null);
    setResolving(true);
    try {
      const result = await resolveProfileFromUrl(url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview({ ...result.person, demo: result.demo });
      setCategory(defaultCategoryForPlatform(result.person.platform));
    } finally {
      setResolving(false);
    }
  }

  function handleConfirmAdd() {
    if (!canEdit || !preview) return;
    onAddPerson({
      name: preview.name,
      avatarUrl: preview.avatarUrl,
      profileUrl: preview.profileUrl,
      platform: preview.platform,
      category,
    });
    setUrl("");
    setPreview(null);
    setError(null);
  }

  function handleCancelPreview() {
    setPreview(null);
    setError(null);
  }

  function handleConnect(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !connectFromId || !connectTarget) return;
    onCreateConnection(connectFromId, connectTarget);
    setConnectTarget("");
  }

  return (
    <>
      {twitchReady === false ? (
        <p className="demo-banner" role="status">
          <strong>Demo-Modus:</strong> Twitch Client ID/Secret fehlen oder passen
          nicht. Twitch-Links nutzen ein Platzhalter-Avatar. X/Twitter funktioniert
          weiterhin.
        </p>
      ) : null}

      <section className={`panel${!canEdit ? " panel-locked" : ""}`}>
        <h2>Person hinzufügen</h2>
        {!canEdit ? (
          <p className="lock-hint" role="note">
            <strong>Gesperrt.</strong> Bearbeiten ist gerade nicht möglich.
          </p>
        ) : null}

        {!preview ? (
          <form onSubmit={(e) => void handleLookup(e)} className="stack">
            <label>
              Twitch- oder X/Twitter-Profil-Link
              <input
                type="url"
                value={canEdit ? url : ""}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://twitch.tv/jemand oder https://x.com/jemand"
                required={canEdit}
                disabled={fieldsDisabled}
                aria-disabled={!canEdit}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button
              type="submit"
              className="btn primary"
              disabled={fieldsDisabled || (canEdit && !url.trim())}
            >
              {resolving ? "Profil wird geladen…" : "Profil laden"}
            </button>
          </form>
        ) : (
          <div className="stack">
            <div className="profile-preview" aria-live="polite">
              <img
                src={preview.avatarUrl}
                alt=""
                width={64}
                height={64}
                className="profile-preview-avatar"
              />
              <div className="profile-preview-meta">
                <strong className="profile-preview-name">{preview.name}</strong>
                <span className="profile-preview-platform">
                  {platformLabel(preview.platform)}
                  {preview.demo ? " · Demo-Avatar" : ""}
                </span>
                <a
                  href={preview.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="profile-preview-link"
                >
                  {preview.profileUrl.replace(/^https?:\/\//, "")}
                </a>
              </div>
            </div>
            <label>
              Kategorie
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                disabled={!canEdit}
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                onClick={handleConfirmAdd}
                disabled={!canEdit}
              >
                Zum Netzwerk hinzufügen
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={handleCancelPreview}
                disabled={!canEdit}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        <p className="hint">
          Link einfügen → Profilbild & Name prüfen → hinzufügen. Danach
          Verbindungen ziehen.
        </p>
      </section>

      <section className={`panel${!canEdit ? " panel-locked" : ""}`}>
        <h2>Verbindung ziehen</h2>
        {!canEdit ? (
          <p className="lock-hint" role="note">
            <strong>Gesperrt.</strong> Nach dem Hinzufügen zwei Personen wählen.
          </p>
        ) : (
          <p className="hint">
            Klicke einen Knoten im Graphen oder wähle unten „Von“, dann „Nach“ —
            oder klicke nacheinander zwei Knoten.
          </p>
        )}
        <div className="stack">
          <label>
            Von
            <select
              value={connectFromId ?? ""}
              onChange={(e) => onStartConnect(e.target.value || null)}
              disabled={!canEdit}
            >
              <option value="">Person wählen…</option>
              {peopleSorted.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({CATEGORY_LABELS[p.category]})
                </option>
              ))}
            </select>
          </label>
          {connectFrom || !canEdit ? (
            <form onSubmit={handleConnect} className="stack">
              <label>
                Nach
                <select
                  value={canEdit ? connectTarget : ""}
                  onChange={(e) => setConnectTarget(e.target.value)}
                  required={canEdit}
                  disabled={!canEdit || !connectFromId}
                >
                  <option value="">Ziel wählen…</option>
                  {peopleSorted
                    .filter((p) => p.id !== connectFromId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({CATEGORY_LABELS[p.category]})
                      </option>
                    ))}
                </select>
              </label>
              <div className="btn-row">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!canEdit || !connectTarget}
                >
                  Verbinden
                </button>
                {canEdit && connectFrom ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      onStartConnect(null);
                      setConnectTarget("");
                    }}
                  >
                    Abbrechen
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>
      </section>


      {canEdit && connectFrom ? (
        <section className="panel panel-danger">
          <h2>Ausgewählt</h2>
          <div className="profile-preview">
            <img
              src={connectFrom.avatarUrl}
              alt=""
              width={48}
              height={48}
              className="profile-preview-avatar"
            />
            <div className="profile-preview-meta">
              <strong className="profile-preview-name">{connectFrom.name}</strong>
              <span className="profile-preview-platform">
                {CATEGORY_LABELS[connectFrom.category]}
              </span>
            </div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn danger"
              onClick={() => onDeletePerson(connectFrom.id)}
            >
              Person entfernen
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onStartConnect(null)}
            >
              Auswahl aufheben
            </button>
          </div>
          <p className="hint">
            Entfernen löscht auch alle Verbindungen dieser Person.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <h2>Personen ({people.length})</h2>
        <ul className="people-list">
          {peopleSorted.map((p) => (
            <li key={p.id}>
              <div
                className={`person-row${connectFromId === p.id ? " active" : ""}`}
              >
                <button
                  type="button"
                  className="person-select"
                  onClick={() => {
                    if (canEdit) onStartConnect(p.id);
                  }}
                  disabled={!canEdit}
                  title={
                    canEdit
                      ? "Verbindung von dieser Person starten"
                      : undefined
                  }
                >
                  <img src={p.avatarUrl} alt="" width={28} height={28} />
                  <span className="person-meta">
                    <strong>{p.name}</strong>
                    {!canEdit ? (
                      <span
                        className="cat-pill"
                        style={{ background: CATEGORY_COLORS[p.category] }}
                      >
                        {CATEGORY_LABELS[p.category]}
                      </span>
                    ) : null}
                  </span>
                </button>
                {canEdit ? (
                  <>
                    <select
                      className="person-category"
                      value={p.category}
                      aria-label={`Kategorie für ${p.name}`}
                      onChange={(e) =>
                        onUpdateCategory(p.id, e.target.value as Category)
                      }
                      style={{
                        borderColor: CATEGORY_COLORS[p.category],
                      }}
                    >
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn icon-danger"
                      aria-label={`${p.name} entfernen`}
                      title="Person entfernen"
                      onClick={() => onDeletePerson(p.id)}
                    >
                      Löschen
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {statusMessage ? <p className="status">{statusMessage}</p> : null}
    </>
  );
}

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
  onStartConnect: (personId: string | null) => void;
  onCreateConnection: (sourceId: string, targetId: string) => void;
  statusMessage: string | null;
}

export function Sidebar({
  people,
  connectFromId,
  canEdit,
  onAddPerson,
  onUpdateCategory,
  onStartConnect,
  onCreateConnection,
  statusMessage,
}: SidebarProps) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("Streamer");
  const [error, setError] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState("");
  const [resolving, setResolving] = useState(false);
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
    }
  }, [canEdit, onStartConnect]);

  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const connectFrom = people.find((p) => p.id === connectFromId) ?? null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    setResolving(true);
    try {
      const result = await resolveProfileFromUrl(url);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAddPerson({
        ...result.person,
        category,
      });
      setUrl("");
      setCategory(defaultCategoryForPlatform(result.person.platform));
    } finally {
      setResolving(false);
    }
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
          <strong>Demo mode:</strong> Twitch Client ID/Secret missing or
          mismatched. Twitch links use a stub avatar. Set matching{" "}
          <code>TWITCH_CLIENT_ID</code> + <code>TWITCH_CLIENT_SECRET</code> (see
          README). X/Twitter still resolves for real.
        </p>
      ) : null}

      {canEdit ? (
        <section className="panel">
          <h2>Add person</h2>
          <form onSubmit={(e) => void handleAdd(e)} className="stack">
            <label>
              Twitch or X profile URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://twitch.tv/someone"
                required
                disabled={resolving}
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                disabled={resolving}
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="btn primary" disabled={resolving}>
              {resolving ? "Resolving…" : "Add to network"}
            </button>
          </form>
          <p className="hint">
            Twitch uses Helix via <code>/api/twitch-user</code>. X uses public
            profile helpers (no paid API key).
          </p>
        </section>
      ) : (
        <section className="panel">
          <h2>Editing locked</h2>
          <p className="hint">
            Sign in with Discord and hold the configured editor role to add
            people, change categories, or draw connections.
          </p>
        </section>
      )}

      {canEdit ? (
        <section className="panel">
          <h2>Draw connection</h2>
          <p className="hint">
            Click a node on the graph, or pick a person below, then choose a
            target.
          </p>
          <div className="stack">
            <label>
              From
              <select
                value={connectFromId ?? ""}
                onChange={(e) => onStartConnect(e.target.value || null)}
              >
                <option value="">Select person…</option>
                {sortedPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </label>
            {connectFrom ? (
              <form onSubmit={handleConnect} className="stack">
                <label>
                  To
                  <select
                    value={connectTarget}
                    onChange={(e) => setConnectTarget(e.target.value)}
                    required
                  >
                    <option value="">Select target…</option>
                    {sortedPeople
                      .filter((p) => p.id !== connectFromId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.category})
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!connectTarget}
                >
                  Connect
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    onStartConnect(null);
                    setConnectTarget("");
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2>People ({people.length})</h2>
        <ul className="people-list">
          {sortedPeople.map((p) => (
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
                  title={canEdit ? "Start connection from this person" : undefined}
                >
                  <img src={p.avatarUrl} alt="" width={28} height={28} />
                  <span className="person-meta">
                    <strong>{p.name}</strong>
                    {!canEdit ? (
                      <span
                        className="cat-pill"
                        style={{ background: CATEGORY_COLORS[p.category] }}
                      >
                        {p.category}
                      </span>
                    ) : null}
                  </span>
                </button>
                {canEdit ? (
                  <select
                    className="person-category"
                    value={p.category}
                    aria-label={`Category for ${p.name}`}
                    onChange={(e) =>
                      onUpdateCategory(p.id, e.target.value as Category)
                    }
                    style={{
                      borderColor: CATEGORY_COLORS[p.category],
                    }}
                  >
                    {ALL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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

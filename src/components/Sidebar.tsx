import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import type {
  Category,
  Connection,
  ConnectionKind,
  Person,
  PersonDraft,
} from "../types";
import {
  ALL_CATEGORIES,
  ALL_CONNECTION_KINDS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CONNECTION_KIND_COLORS,
  CONNECTION_KIND_LABELS,
  PERSON_DRAG_MIME,
} from "../types";
import {
  defaultCategoryForPlatform,
  resolveProfileFromUrl,
} from "../utils/resolveProfile";

interface SidebarProps {
  people: Person[];
  connections: Connection[];
  connectFromId: string | null;
  connectKind: ConnectionKind;
  canEdit: boolean;
  previewClearToken?: number;
  onAddPerson: (person: PersonDraft) => void;
  onUpdateCategory: (personId: string, category: Category) => void;
  onDeletePerson: (personId: string) => void;
  onDeleteConnection: (connectionId: string) => void;
  onStartConnect: (personId: string | null) => void;
  onConnectKindChange: (kind: ConnectionKind) => void;
  onCreateConnection: (
    sourceId: string,
    targetId: string,
    kind: ConnectionKind,
  ) => void;
  statusMessage: string | null;
}

type PreviewPerson = Omit<Person, "id" | "category"> & {
  demo?: boolean;
};

function platformLabel(platform: Person["platform"]): string {
  if (platform === "twitch") return "Twitch";
  if (platform === "twitter") return "Twitter";
  if (platform === "x") return "X";
  return "Profil";
}

export function Sidebar({
  people,
  connections,
  connectFromId,
  connectKind,
  canEdit,
  previewClearToken = 0,
  onAddPerson,
  onUpdateCategory,
  onDeletePerson,
  onDeleteConnection,
  onStartConnect,
  onConnectKindChange,
  onCreateConnection,
  statusMessage,
}: SidebarProps) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("Streamer");
  const [error, setError] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState("");
  const [resolving, setResolving] = useState(false);
  const [preview, setPreview] = useState<PreviewPerson | null>(null);
  const [dragging, setDragging] = useState(false);
  const previewCardRef = useRef<HTMLDivElement | null>(null);

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

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const p of people) map.set(p.id, p);
    return map;
  }, [people]);

  const connectionsSorted = useMemo(() => {
    return [...connections].sort((a, b) => {
      const an = peopleById.get(a.source)?.name ?? a.source;
      const bn = peopleById.get(b.source)?.name ?? b.source;
      const cmp = an.localeCompare(bn);
      if (cmp !== 0) return cmp;
      const at = peopleById.get(a.target)?.name ?? a.target;
      const bt = peopleById.get(b.target)?.name ?? b.target;
      return at.localeCompare(bt);
    });
  }, [connections, peopleById]);

  const connectFrom = people.find((p) => p.id === connectFromId) ?? null;
  const fieldsDisabled = !canEdit || resolving;

  function clearPreview() {
    setPreview(null);
    setError(null);
    setUrl("");
  }

  useEffect(() => {
    if (previewClearToken <= 0) return;
    setPreview(null);
    setError(null);
    setUrl("");
  }, [previewClearToken]);

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

  function draftFromPreview(): PersonDraft | null {
    if (!preview) return null;
    return {
      name: preview.name,
      avatarUrl: preview.avatarUrl,
      profileUrl: preview.profileUrl,
      platform: preview.platform,
      category,
    };
  }

  function handleConfirmAdd() {
    if (!canEdit) return;
    const draft = draftFromPreview();
    if (!draft) return;
    onAddPerson(draft);
    clearPreview();
  }

  function handleCancelPreview() {
    clearPreview();
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    if (!canEdit || !preview) {
      e.preventDefault();
      return;
    }
    const draft = draftFromPreview();
    if (!draft) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(PERSON_DRAG_MIME, JSON.stringify(draft));
    e.dataTransfer.setData(
      "text/plain",
      `${draft.name} (${CATEGORY_LABELS[draft.category]})`,
    );
    e.dataTransfer.effectAllowed = "copy";
    if (previewCardRef.current) {
      e.dataTransfer.setDragImage(previewCardRef.current, 40, 40);
    }
    setDragging(true);
  }

  function handleDragEnd() {
    setDragging(false);
  }

  function handleConnect(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !connectFromId || !connectTarget) return;
    onCreateConnection(connectFromId, connectTarget, connectKind);
    setConnectTarget("");
  }

  return (
    <>
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
            <p className="hint" id="role-hint">
              Zuerst Funktion wählen, dann die Karte auf den Graph ziehen.
            </p>

            <fieldset className="role-fieldset" aria-describedby="role-hint">
              <legend>Funktion</legend>
              <div className="role-chips" role="radiogroup" aria-label="Funktion">
                {ALL_CATEGORIES.map((c) => {
                  const selected = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`role-chip${selected ? " on" : ""}`}
                      style={
                        selected
                          ? {
                              borderColor: CATEGORY_COLORS[c],
                              boxShadow: `0 0 0 2px ${CATEGORY_COLORS[c]}33`,
                            }
                          : undefined
                      }
                      onClick={() => setCategory(c)}
                      disabled={!canEdit}
                    >
                      <span
                        className="swatch"
                        style={{ background: CATEGORY_COLORS[c] }}
                      />
                      {CATEGORY_LABELS[c]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div
              ref={previewCardRef}
              className={`profile-preview profile-preview-draggable${dragging ? " is-dragging" : ""}`}
              draggable={canEdit}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              aria-grabbed={dragging}
              title="Auf den Graph ziehen, um zu platzieren"
            >
              <span className="drag-grip" aria-hidden="true">
                ⋮⋮
              </span>
              <img
                src={preview.avatarUrl}
                alt=""
                width={64}
                height={64}
                className="profile-preview-avatar"
                draggable={false}
              />
              <div className="profile-preview-meta">
                <strong className="profile-preview-name">{preview.name}</strong>
                <span className="profile-preview-platform">
                  {platformLabel(preview.platform)}
                  {" · "}
                  <span style={{ color: CATEGORY_COLORS[category] }}>
                    {CATEGORY_LABELS[category]}
                  </span>
                  {preview.demo ? " · Demo-Avatar" : ""}
                </span>
                <a
                  href={preview.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="profile-preview-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {preview.profileUrl.replace(/^https?:\/\//, "")}
                </a>
                <span className="drag-hint">Ziehen → Graph</span>
              </div>
            </div>

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
          Link → Profil laden → Funktion wählen → auf den Graph ziehen (oder
          Button). Danach Verbindungen ziehen.
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
            Zuerst den Verbindungstyp wählen (Mod / Fren / Streamerkollege),
            dann Von/Nach oder zwei Knoten im Graph.
          </p>
        )}
        <div className="stack">
          <fieldset className="role-fieldset">
            <legend>Verbindungstyp</legend>
            <div
              className="role-chips"
              role="radiogroup"
              aria-label="Verbindungstyp"
            >
              {ALL_CONNECTION_KINDS.map((k) => {
                const selected = connectKind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`role-chip${selected ? " on" : ""}`}
                    style={
                      selected
                        ? {
                            borderColor: CONNECTION_KIND_COLORS[k],
                            boxShadow: `0 0 0 2px ${CONNECTION_KIND_COLORS[k]}33`,
                          }
                        : undefined
                    }
                    onClick={() => onConnectKindChange(k)}
                    disabled={!canEdit}
                  >
                    <span
                      className="swatch"
                      style={{ background: CONNECTION_KIND_COLORS[k] }}
                    />
                    {CONNECTION_KIND_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </fieldset>

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
                  Als {CONNECTION_KIND_LABELS[connectKind]} verbinden
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
        <h2>Verbindungen ({connections.length})</h2>
        {connectionsSorted.length === 0 ? (
          <p className="hint">Noch keine Verbindungen.</p>
        ) : (
          <ul className="connections-list">
            {connectionsSorted.map((c) => {
              const a = peopleById.get(c.source);
              const b = peopleById.get(c.target);
              const kind = c.kind;
              return (
                <li key={c.id} className="connection-row">
                  <div className="connection-meta">
                    <span className="connection-names">
                      <strong>{a?.name ?? c.source}</strong>
                      <span className="connection-arrow" aria-hidden="true">
                        ↔
                      </span>
                      <strong>{b?.name ?? c.target}</strong>
                    </span>
                    <span
                      className="cat-pill"
                      style={{ background: CONNECTION_KIND_COLORS[kind] }}
                    >
                      {CONNECTION_KIND_LABELS[kind]}
                    </span>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn icon-danger"
                      aria-label={`Verbindung ${CONNECTION_KIND_LABELS[kind]} löschen`}
                      title="Verbindung löschen"
                      onClick={() => onDeleteConnection(c.id)}
                    >
                      Löschen
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
                      aria-label={`Funktion für ${p.name}`}
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

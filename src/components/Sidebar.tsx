import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import type {
  Connection,
  ConnectionKind,
  Person,
  PersonDraft,
  Role,
} from "../types";
import {
  ALL_CONNECTION_KINDS,
  ALL_ROLES,
  CONNECTION_KIND_COLORS,
  CONNECTION_KIND_LABELS,
  formatConnectionTags,
  formatRoles,
  PERSON_DRAG_MIME,
  ROLE_COLORS,
  ROLE_LABELS,
  toggleInList,
} from "../types";
import {
  defaultRolesForPlatform,
  resolveProfileFromUrl,
} from "../utils/resolveProfile";

interface SidebarProps {
  people: Person[];
  connections: Connection[];
  connectFromId: string | null;
  connectKinds: ConnectionKind[];
  connectRoles: Role[];
  canEdit: boolean;
  previewClearToken?: number;
  onAddPerson: (person: PersonDraft) => void;
  onUpdateRoles: (personId: string, roles: Role[]) => void;
  onDeletePerson: (personId: string) => void;
  onDeleteConnection: (connectionId: string) => void;
  onStartConnect: (personId: string | null) => void;
  onConnectKindsChange: (kinds: ConnectionKind[]) => void;
  onConnectRolesChange: (roles: Role[]) => void;
  onCreateConnection: (
    sourceId: string,
    targetId: string,
    kinds: ConnectionKind[],
    roles: Role[],
  ) => void;
  statusMessage: string | null;
}

type PreviewPerson = Omit<Person, "id" | "roles"> & {
  demo?: boolean;
};

function platformLabel(platform: Person["platform"]): string {
  if (platform === "twitch") return "Twitch";
  if (platform === "twitter") return "Twitter";
  if (platform === "x") return "X";
  return "Profil";
}

function RoleMultiSelect({
  value,
  onChange,
  disabled,
  legend = "Funktionen (Mehrfachauswahl)",
  allowEmpty = false,
  hint = "Mehrere Häkchen möglich",
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
  disabled?: boolean;
  legend?: string;
  /** When true, all roles can be unchecked (edge tags). */
  allowEmpty?: boolean;
  hint?: string;
}) {
  return (
    <fieldset className="role-fieldset" disabled={disabled}>
      <legend>{legend}</legend>
      <p className="role-multi-hint">{hint}</p>
      <div className="role-checks" role="group" aria-label={legend}>
        {ALL_ROLES.map((r) => {
          const selected = value.includes(r);
          const inputId = `role-${legend.replace(/\W+/g, "-").toLowerCase()}-${r}`;
          return (
            <label
              key={r}
              htmlFor={inputId}
              className={`role-check${selected ? " on" : ""}`}
              style={
                selected
                  ? {
                      borderColor: ROLE_COLORS[r],
                      boxShadow: `0 0 0 2px ${ROLE_COLORS[r]}33`,
                    }
                  : undefined
              }
            >
              <input
                id={inputId}
                type="checkbox"
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(toggleInList(value, r, !allowEmpty))}
              />
              <span
                className="swatch"
                style={{ background: ROLE_COLORS[r] }}
                aria-hidden="true"
              />
              <span>{ROLE_LABELS[r]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}


function KindMultiSelect({
  value,
  onChange,
  disabled,
}: {
  value: ConnectionKind[];
  onChange: (kinds: ConnectionKind[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="role-fieldset" disabled={disabled}>
      <legend>Beziehungstypen (Mehrfachauswahl)</legend>
      <p className="role-multi-hint">z.B. Mod + Fren gleichzeitig</p>
      <div className="role-checks" role="group" aria-label="Beziehungstypen">
        {ALL_CONNECTION_KINDS.map((k) => {
          const selected = value.includes(k);
          const inputId = `conn-kind-${k}`;
          return (
            <label
              key={k}
              htmlFor={inputId}
              className={`role-check${selected ? " on" : ""}`}
              style={
                selected
                  ? {
                      borderColor: CONNECTION_KIND_COLORS[k],
                      boxShadow: `0 0 0 2px ${CONNECTION_KIND_COLORS[k]}33`,
                    }
                  : undefined
              }
            >
              <input
                id={inputId}
                type="checkbox"
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(toggleInList(value, k))}
              />
              <span
                className="swatch"
                style={{ background: CONNECTION_KIND_COLORS[k] }}
                aria-hidden="true"
              />
              <span>{CONNECTION_KIND_LABELS[k]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Sidebar({
  people,
  connections,
  connectFromId,
  connectKinds,
  connectRoles,
  canEdit,
  previewClearToken = 0,
  onAddPerson,
  onUpdateRoles,
  onDeletePerson,
  onDeleteConnection,
  onStartConnect,
  onConnectKindsChange,
  onConnectRolesChange,
  onCreateConnection,
  statusMessage,
}: SidebarProps) {
  const [url, setUrl] = useState("");
  const [roles, setRoles] = useState<Role[]>(["Streamer"]);
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
      setRoles(defaultRolesForPlatform(result.person.platform));
    } finally {
      setResolving(false);
    }
  }

  function draftFromPreview(): PersonDraft | null {
    if (!preview || !roles.length) return null;
    return {
      name: preview.name,
      avatarUrl: preview.avatarUrl,
      profileUrl: preview.profileUrl,
      platform: preview.platform,
      roles: [...roles],
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
      `${draft.name} (${formatRoles(draft.roles)})`,
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
    if (!connectKinds.length && !connectRoles.length) return;
    onCreateConnection(
      connectFromId,
      connectTarget,
      connectKinds,
      connectRoles,
    );
    setConnectTarget("");
  }

  const connectTagSummary = formatConnectionTags(connectKinds, connectRoles);
  const canSubmitConnect =
    canEdit &&
    !!connectTarget &&
    (connectKinds.length > 0 || connectRoles.length > 0);

  return (
    <>
      <div className="sidebar-panels">
        <div className="sidebar-col sidebar-col-tools">
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
              Funktionen wählen (mehrere möglich), dann die Karte auf den Graph
              ziehen.
            </p>

            <RoleMultiSelect
              value={roles}
              onChange={setRoles}
              disabled={!canEdit}
            />

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
                  <span className="role-inline-pills">
                    {roles.map((r) => (
                      <span
                        key={r}
                        className="cat-pill"
                        style={{ background: ROLE_COLORS[r] }}
                      >
                        {ROLE_LABELS[r]}
                      </span>
                    ))}
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
                disabled={!canEdit || !roles.length}
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
          Link → Profil laden → Funktionen wählen → auf den Graph ziehen (oder
          Button). Verbindungen sind gerichtet (Pfeil A → B).
        </p>
      </section>

<section className="panel">
        <h2>Verbindungen ({connections.length})</h2>
        {connectionsSorted.length === 0 ? (
          <p className="hint">Noch keine Verbindungen.</p>
        ) : (
          <ul className="connections-list">
            {connectionsSorted.map((c) => {
              const a = peopleById.get(c.source);
              const b = peopleById.get(c.target);
              const tag = formatConnectionTags(c.kinds, c.roles);
              return (
                <li key={c.id} className="connection-row">
                  <div className="connection-meta">
                    <span className="connection-names">
                      <strong>{a?.name ?? c.source}</strong>
                      <span className="connection-arrow" aria-hidden="true">
                        →
                      </span>
                      <strong>{b?.name ?? c.target}</strong>
                    </span>
                    <span className="role-inline-pills">
                      {c.kinds.map((k) => (
                        <span
                          key={`k-${k}`}
                          className="cat-pill"
                          style={{ background: CONNECTION_KIND_COLORS[k] }}
                          title="Beziehung"
                        >
                          {CONNECTION_KIND_LABELS[k]}
                        </span>
                      ))}
                      {c.roles.map((r) => (
                        <span
                          key={`r-${r}`}
                          className="cat-pill cat-pill-role-tag"
                          style={{ background: ROLE_COLORS[r] }}
                          title="Rollen-Tag"
                        >
                          {ROLE_LABELS[r]}
                        </span>
                      ))}
                    </span>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn icon-danger"
                      aria-label={`Verbindung ${tag} löschen`}
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

<section className={`panel${!canEdit ? " panel-locked" : ""}`}>
        <h2>Verbindung ziehen</h2>
        {!canEdit ? (
          <p className="lock-hint" role="note">
            <strong>Gesperrt.</strong> Nach dem Hinzufügen zwei Personen wählen.
          </p>
        ) : (
          <p className="hint">
            Beziehungstypen und/oder Rollen-Tags wählen (Mehrfachauswahl), dann
            Von → Nach oder zwei Knoten im Graph. Richtung: Von → Nach (Pfeil).
          </p>
        )}
        <div className="stack">
          <KindMultiSelect
            value={connectKinds}
            onChange={onConnectKindsChange}
            disabled={!canEdit}
          />
          <RoleMultiSelect
            value={connectRoles}
            onChange={onConnectRolesChange}
            disabled={!canEdit}
            allowEmpty
            legend="Rollen-Tags an der Kante (Mehrfachauswahl)"
            hint="Optional — z.B. Ex-Mod + gebannt neben Beziehungstypen"
          />

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
                  {p.name} ({formatRoles(p.roles)})
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
                        {p.name} ({formatRoles(p.roles)})
                      </option>
                    ))}
                </select>
              </label>
              <div className="btn-row">
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!canSubmitConnect}
                >
                  Als {connectTagSummary} verbinden (→)
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
              <span className="role-inline-pills">
                {connectFrom.roles.map((r) => (
                  <span
                    key={r}
                    className="cat-pill"
                    style={{ background: ROLE_COLORS[r] }}
                  >
                    {ROLE_LABELS[r]}
                  </span>
                ))}
              </span>
            </div>
          </div>
          <RoleMultiSelect
            value={connectFrom.roles}
            onChange={(next) => onUpdateRoles(connectFrom.id, next)}
            legend="Rollen bearbeiten"
          />
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
        </div>

        <div className="sidebar-col sidebar-col-people">
<section className="panel">
        <h2>Personen ({people.length})</h2>
        <ul className="people-list">
          {peopleSorted.map((p) => (
            <li key={p.id}>
              <div
                className={`person-row person-row-multi${connectFromId === p.id ? " active" : ""}`}
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
                    <span className="role-inline-pills">
                      {p.roles.map((r) => (
                        <span
                          key={r}
                          className="cat-pill"
                          style={{ background: ROLE_COLORS[r] }}
                        >
                          {ROLE_LABELS[r]}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
                {canEdit ? (
                  <div className="person-role-edit">
                    <RoleMultiSelect
                      value={p.roles}
                      onChange={(next) => onUpdateRoles(p.id, next)}
                      legend={`Rollen · ${p.name}`}
                    />
                    <button
                      type="button"
                      className="btn icon-danger"
                      aria-label={`${p.name} entfernen`}
                      title="Person entfernen"
                      onClick={() => onDeletePerson(p.id)}
                    >
                      Löschen
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
        </div>
      </div>
      {statusMessage ? <p className="status">{statusMessage}</p> : null}
    </>
  );
}

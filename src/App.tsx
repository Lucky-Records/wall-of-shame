import { useCallback, useEffect, useState } from "react";
import { CategoryFilters } from "./components/CategoryFilters";
import { NetworkGraph } from "./components/NetworkGraph";
import { Sidebar } from "./components/Sidebar";
import {
  apiAddConnection,
  apiAddPerson,
  apiDeleteConnection,
  apiDeletePerson,
  apiUpdateConnection,
  apiUpdatePosition,
  apiUpdateRoles,
  fetchGraph,
} from "./hooks/useGraphApi";
import type {
  Connection,
  ConnectionKind,
  GraphPosition,
  Person,
  PersonDraft,
  Role,
} from "./types";
import {
  ALL_ROLES,
  DEFAULT_CONNECTION_KIND,
  formatConnectionTags,
  formatRoles,
} from "./types";

function hasCoords(
  value: { x?: number; y?: number } | null | undefined,
): boolean {
  return (
    !!value &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

export default function App() {
  const [people, setPeople] = useState<Person[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [visibleRoles, setVisibleRoles] = useState<Set<Role>>(
    () => new Set(ALL_ROLES),
  );
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectKinds, setConnectKinds] = useState<ConnectionKind[]>([
    DEFAULT_CONNECTION_KIND,
  ]);
  const [connectRoles, setConnectRoles] = useState<Role[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [positionHints, setPositionHints] = useState<
    Record<string, GraphPosition>
  >({});
  const [previewClearToken, setPreviewClearToken] = useState(0);

  const flash = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2800);
  }, []);

  const reloadGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const data = await fetchGraph();
      setPeople(data.people);
      setConnections(data.connections);
      const hints: Record<string, GraphPosition> = {};
      for (const person of data.people) {
        if (hasCoords(person)) {
          hints[person.id] = { x: person.x!, y: person.y! };
        }
      }
      setPositionHints(hints);
    } catch (err) {
      setGraphError(
        err instanceof Error
          ? err.message
          : "Netzwerkdaten konnten nicht geladen werden.",
      );
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadGraph();
  }, [reloadGraph]);

  const handleAddPerson = useCallback(
    async (draft: PersonDraft, position?: GraphPosition) => {
      try {
        const person = await apiAddPerson(
          position
            ? { ...draft, x: position.x, y: position.y }
            : draft,
        );
        setPeople((prev) => [...prev, person]);
        if (hasCoords(person)) {
          setPositionHints((prev) => ({
            ...prev,
            [person.id]: { x: person.x!, y: person.y! },
          }));
        } else if (position) {
          setPositionHints((prev) => ({ ...prev, [person.id]: position }));
        }
        setPreviewClearToken((n) => n + 1);
        flash(
          `${person.name} als ${formatRoles(person.roles)} hinzugefügt.`,
        );
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Person konnte nicht hinzugefügt werden.",
        );
      }
    },
    [flash],
  );

  const handleNodeMove = useCallback(
    async (personId: string, position: GraphPosition) => {
      setPeople((prev) =>
        prev.map((p) =>
          p.id === personId ? { ...p, x: position.x, y: position.y } : p,
        ),
      );
      setPositionHints((prev) => ({ ...prev, [personId]: position }));
      try {
        const person = await apiUpdatePosition(personId, position);
        setPeople((prev) =>
          prev.map((p) => (p.id === person.id ? person : p)),
        );
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Position konnte nicht gespeichert werden.",
        );
      }
    },
    [flash],
  );

  const handleUpdateRoles = useCallback(
    async (personId: string, roles: Role[]) => {
      if (!roles.length) {
        flash("Mindestens eine Rolle ist nötig.");
        return;
      }
      const previous = people.find((p) => p.id === personId);
      // Optimistic: keep multi-select responsive
      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, roles: [...roles] } : p)),
      );
      try {
        const person = await apiUpdateRoles(personId, roles);
        setPeople((prev) =>
          prev.map((p) => (p.id === person.id ? person : p)),
        );
        flash(`${person.name} → ${formatRoles(roles)} aktualisiert.`);
      } catch (err) {
        if (previous) {
          setPeople((prev) =>
            prev.map((p) => (p.id === previous.id ? previous : p)),
          );
        }
        flash(
          err instanceof Error
            ? err.message
            : "Rollen konnten nicht aktualisiert werden.",
        );
      }
    },
    [people, flash],
  );

  const handleDeletePerson = useCallback(
    async (personId: string) => {
      const person = people.find((p) => p.id === personId);
      if (!person) return;
      const ok = window.confirm(
        `„${person.name}“ wirklich entfernen?\nAlle Verbindungen dieser Person werden gelöscht.`,
      );
      if (!ok) return;
      try {
        const removed = await apiDeletePerson(personId);
        setPeople((prev) => prev.filter((p) => p.id !== removed.id));
        setConnections((prev) =>
          prev.filter(
            (c) => c.source !== removed.id && c.target !== removed.id,
          ),
        );
        setConnectFromId((cur) => (cur === removed.id ? null : cur));
        setPositionHints((prev) => {
          const next = { ...prev };
          delete next[removed.id];
          return next;
        });
        flash(`${removed.name} entfernt.`);
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Person konnte nicht entfernt werden.",
        );
      }
    },
    [people, flash],
  );

  const handleCreateConnection = useCallback(
    async (
      sourceId: string,
      targetId: string,
      kinds: ConnectionKind[],
      roles: Role[],
    ) => {
      if (sourceId === targetId) {
        flash("Eine Person kann nicht mit sich selbst verbunden werden.");
        return;
      }
      if (!kinds.length && !roles.length) {
        flash("Mindestens einen Verbindungstyp oder ein Rollen-Tag wählen.");
        return;
      }
      try {
        const connection = await apiAddConnection(
          sourceId,
          targetId,
          kinds,
          roles,
        );
        setConnections((prev) => {
          const without = prev.filter(
            (c) =>
              !(c.source === connection.source && c.target === connection.target),
          );
          return [...without, connection];
        });
        setConnectFromId(null);
        const a = people.find((p) => p.id === sourceId)?.name ?? sourceId;
        const b = people.find((p) => p.id === targetId)?.name ?? targetId;
        flash(
          `${a} → ${b} · ${formatConnectionTags(connection.kinds, connection.roles)}`,
        );
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Verbindung konnte nicht erstellt werden.",
        );
      }
    },
    [people, flash],
  );

  const handleDeleteConnection = useCallback(
    async (connectionId: string) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      const a = people.find((p) => p.id === conn.source)?.name ?? conn.source;
      const b = people.find((p) => p.id === conn.target)?.name ?? conn.target;
      const tag = formatConnectionTags(conn.kinds, conn.roles);
      const ok = window.confirm(
        `Verbindung „${tag}“ ${a} → ${b} löschen?`,
      );
      if (!ok) return;
      try {
        const removed = await apiDeleteConnection(connectionId);
        setConnections((prev) => prev.filter((c) => c.id !== removed.id));
        flash(
          `${a} → ${b} · ${formatConnectionTags(removed.kinds, removed.roles)} entfernt.`,
        );
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Verbindung konnte nicht gelöscht werden.",
        );
      }
    },
    [connections, people, flash],
  );

  const handleUpdateConnectionTags = useCallback(
    async (
      connectionId: string,
      kinds: ConnectionKind[],
      roles: Role[],
    ) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      const a = people.find((p) => p.id === conn.source)?.name ?? conn.source;
      const b = people.find((p) => p.id === conn.target)?.name ?? conn.target;

      try {
        const result = await apiUpdateConnection(connectionId, kinds, roles);
        if (result.deleted) {
          setConnections((prev) => prev.filter((c) => c.id !== connectionId));
          flash(
            `${a} → ${b} · ${formatConnectionTags(conn.kinds, conn.roles)} entfernt (keine Tags übrig).`,
          );
        } else {
          setConnections((prev) =>
            prev.map((c) =>
              c.id === connectionId ? result.connection : c,
            ),
          );
          flash(
            `${a} → ${b} · ${formatConnectionTags(result.connection.kinds, result.connection.roles)}`,
          );
        }
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Verbindungs-Tags konnten nicht aktualisiert werden.",
        );
      }
    },
    [connections, people, flash],
  );

  const handleNodeClick = useCallback(
    (personId: string) => {
      if (!connectFromId) {
        setConnectFromId(personId);
        return;
      }
      if (connectFromId === personId) {
        setConnectFromId(null);
        return;
      }
      void handleCreateConnection(
        connectFromId,
        personId,
        connectKinds,
        connectRoles,
      );
    },
    [connectFromId, connectKinds, connectRoles, handleCreateConnection],
  );

  const handlePersonDrop = useCallback(
    (draft: PersonDraft, position: GraphPosition) => {
      void handleAddPerson(draft, position);
    },
    [handleAddPerson],
  );

  const toggleRole = useCallback((role: Role) => {
    setVisibleRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        if (next.size === 1) return prev;
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="sidebar-header">
          <p className="eyebrow">Lucky · öffentlich</p>
          <h1>The Wall of Shame</h1>
          <p className="tagline">
            Interaktive Community-Netzwerk-Karte. Mehrfach-Rollen, gerichtete
            Verbindungen (Pfeile) und sichtbare Funktionen auf dem Brett.
          </p>
        </header>

        <Sidebar
          people={people}
          connections={connections}
          connectFromId={connectFromId}
          connectKinds={connectKinds}
          connectRoles={connectRoles}
          canEdit={true}
          previewClearToken={previewClearToken}
          onAddPerson={(draft) => {
            void handleAddPerson(draft);
          }}
          onUpdateRoles={(id, roles) => {
            void handleUpdateRoles(id, roles);
          }}
          onDeletePerson={(id) => {
            void handleDeletePerson(id);
          }}
          onDeleteConnection={(id) => {
            void handleDeleteConnection(id);
          }}
          onUpdateConnectionTags={(id, kinds, roles) => {
            void handleUpdateConnectionTags(id, kinds, roles);
          }}
          onStartConnect={setConnectFromId}
          onConnectKindsChange={setConnectKinds}
          onConnectRolesChange={setConnectRoles}
          onCreateConnection={(source, target, kinds, roles) => {
            void handleCreateConnection(source, target, kinds, roles);
          }}
          statusMessage={statusMessage}
        />
      </aside>
      <main className="stage">
        <CategoryFilters visible={visibleRoles} onToggle={toggleRole} />
        {graphLoading ? (
          <p className="stage-hint">Netzwerk wird geladen…</p>
        ) : graphError ? (
          <p className="stage-hint error-text">{graphError}</p>
        ) : (
          <NetworkGraph
            people={people}
            connections={connections}
            visibleRoles={visibleRoles}
            connectFromId={connectFromId}
            positionHints={positionHints}
            onNodeClick={handleNodeClick}
            onPersonDrop={handlePersonDrop}
            onNodeMove={(id, pos) => {
              void handleNodeMove(id, pos);
            }}
          />
        )}
        <p className="stage-hint">
          Profil-Icons ziehen zum Verschieben · Hintergrund schieben · Scrollen
          zoomen · Pfeile zeigen Richtung A → B · Rollen-Badges am Knoten
        </p>
      </main>
    </div>
  );
}

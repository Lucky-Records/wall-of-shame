import { useCallback, useEffect, useState } from "react";
import { CategoryFilters } from "./components/CategoryFilters";
import { NetworkGraph } from "./components/NetworkGraph";
import { Sidebar } from "./components/Sidebar";
import {
  apiAddConnection,
  apiAddPerson,
  apiDeleteConnection,
  apiDeletePerson,
  apiUpdateCategory,
  apiUpdatePosition,
  fetchGraph,
} from "./hooks/useGraphApi";
import type {
  Category,
  Connection,
  ConnectionKind,
  GraphPosition,
  Person,
  PersonDraft,
} from "./types";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  CONNECTION_KIND_LABELS,
  DEFAULT_CONNECTION_KIND,
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
  const [visibleCategories, setVisibleCategories] = useState<Set<Category>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectKind, setConnectKind] = useState<ConnectionKind>(
    DEFAULT_CONNECTION_KIND,
  );
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
          `${person.name} als ${CATEGORY_LABELS[person.category]} hinzugefügt.`,
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

  const handleUpdateCategory = useCallback(
    async (personId: string, category: Category) => {
      try {
        const person = await apiUpdateCategory(personId, category);
        setPeople((prev) =>
          prev.map((p) => (p.id === person.id ? person : p)),
        );
        flash(
          `${person.name} → ${CATEGORY_LABELS[category]} aktualisiert.`,
        );
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Kategorie konnte nicht aktualisiert werden.",
        );
      }
    },
    [flash],
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
    async (sourceId: string, targetId: string, kind: ConnectionKind) => {
      if (sourceId === targetId) {
        flash("Eine Person kann nicht mit sich selbst verbunden werden.");
        return;
      }
      const exists = connections.some(
        (c) =>
          (c.source === sourceId && c.target === targetId) ||
          (c.source === targetId && c.target === sourceId),
      );
      if (exists) {
        flash("Diese beiden sind schon verbunden.");
        return;
      }
      try {
        const connection = await apiAddConnection(sourceId, targetId, kind);
        setConnections((prev) => [...prev, connection]);
        setConnectFromId(null);
        const a = people.find((p) => p.id === sourceId)?.name ?? sourceId;
        const b = people.find((p) => p.id === targetId)?.name ?? targetId;
        flash(
          `${a} ↔ ${b} · ${CONNECTION_KIND_LABELS[connection.kind]}`,
        );
      } catch (err) {
        flash(
          err instanceof Error
            ? err.message
            : "Verbindung konnte nicht erstellt werden.",
        );
      }
    },
    [connections, people, flash],
  );

  const handleDeleteConnection = useCallback(
    async (connectionId: string) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      const a = people.find((p) => p.id === conn.source)?.name ?? conn.source;
      const b = people.find((p) => p.id === conn.target)?.name ?? conn.target;
      const ok = window.confirm(
        `Verbindung „${CONNECTION_KIND_LABELS[conn.kind]}“ zwischen ${a} und ${b} löschen?`,
      );
      if (!ok) return;
      try {
        const removed = await apiDeleteConnection(connectionId);
        setConnections((prev) => prev.filter((c) => c.id !== removed.id));
        flash(
          `${a} ↔ ${b} · ${CONNECTION_KIND_LABELS[removed.kind]} entfernt.`,
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
      void handleCreateConnection(connectFromId, personId, connectKind);
    },
    [connectFromId, connectKind, handleCreateConnection],
  );

  const handlePersonDrop = useCallback(
    (draft: PersonDraft, position: GraphPosition) => {
      void handleAddPerson(draft, position);
    },
    [handleAddPerson],
  );

  const toggleCategory = useCallback((category: Category) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        if (next.size === 1) return prev;
        next.delete(category);
      } else {
        next.add(category);
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
            Interaktive Community-Netzwerk-Karte. Jeder kann Personen
            hinzufügen, Kategorien ändern und Verbindungen ziehen.
          </p>
        </header>

        <Sidebar
          people={people}
          connections={connections}
          connectFromId={connectFromId}
          connectKind={connectKind}
          canEdit={true}
          previewClearToken={previewClearToken}
          onAddPerson={(draft) => {
            void handleAddPerson(draft);
          }}
          onUpdateCategory={(id, category) => {
            void handleUpdateCategory(id, category);
          }}
          onDeletePerson={(id) => {
            void handleDeletePerson(id);
          }}
          onDeleteConnection={(id) => {
            void handleDeleteConnection(id);
          }}
          onStartConnect={setConnectFromId}
          onConnectKindChange={setConnectKind}
          onCreateConnection={(source, target, kind) => {
            void handleCreateConnection(source, target, kind);
          }}
          statusMessage={statusMessage}
        />
      </aside>
      <main className="stage">
        <CategoryFilters
          visible={visibleCategories}
          onToggle={toggleCategory}
        />
        {graphLoading ? (
          <p className="stage-hint">Netzwerk wird geladen…</p>
        ) : graphError ? (
          <p className="stage-hint error-text">{graphError}</p>
        ) : (
          <NetworkGraph
            people={people}
            connections={connections}
            visibleCategories={visibleCategories}
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
          Profil-Icons ziehen zum Verschieben · Hintergrund ziehen zum
          Schieben · Scrollen zum Zoomen · Verbindungstyp wählen, dann Knoten
          tippen
        </p>
      </main>
    </div>
  );
}

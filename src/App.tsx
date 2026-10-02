import { useCallback, useState } from "react";
import { CategoryFilters } from "./components/CategoryFilters";
import { NetworkGraph } from "./components/NetworkGraph";
import { Sidebar } from "./components/Sidebar";
import { MOCK_CONNECTIONS, MOCK_PEOPLE } from "./data/mockData";
import type { Category, Connection, Person } from "./types";
import { ALL_CATEGORIES } from "./types";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function App() {
  const [people, setPeople] = useState<Person[]>(MOCK_PEOPLE);
  const [connections, setConnections] =
    useState<Connection[]>(MOCK_CONNECTIONS);
  const [visibleCategories, setVisibleCategories] = useState<Set<Category>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2800);
  }, []);

  const handleAddPerson = useCallback(
    (draft: Omit<Person, "id">) => {
      const base = slugify(draft.name) || `person-${Date.now()}`;
      let id = base;
      let n = 2;
      while (people.some((p) => p.id === id)) {
        id = `${base}-${n}`;
        n += 1;
      }
      if (people.some((p) => p.profileUrl === draft.profileUrl)) {
        flash("That profile is already on the board.");
        return;
      }
      setPeople((prev) => [...prev, { ...draft, id }]);
      flash(`Added ${draft.name}.`);
    },
    [people, flash],
  );

  const handleCreateConnection = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) {
        flash("Cannot connect a person to themselves.");
        return;
      }
      const exists = connections.some(
        (c) =>
          (c.source === sourceId && c.target === targetId) ||
          (c.source === targetId && c.target === sourceId),
      );
      if (exists) {
        flash("Those two are already connected.");
        return;
      }
      const id = `c-${sourceId}-${targetId}-${Date.now()}`;
      setConnections((prev) => [
        ...prev,
        { id, source: sourceId, target: targetId },
      ]);
      setConnectFromId(null);
      const a = people.find((p) => p.id === sourceId)?.name ?? sourceId;
      const b = people.find((p) => p.id === targetId)?.name ?? targetId;
      flash(`Connected ${a} ↔ ${b}.`);
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
      handleCreateConnection(connectFromId, personId);
    },
    [connectFromId, handleCreateConnection],
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
      <Sidebar
        people={people}
        connectFromId={connectFromId}
        onAddPerson={handleAddPerson}
        onStartConnect={setConnectFromId}
        onCreateConnection={handleCreateConnection}
        statusMessage={statusMessage}
      />
      <main className="stage">
        <CategoryFilters
          visible={visibleCategories}
          onToggle={toggleCategory}
        />
        <NetworkGraph
          people={people}
          connections={connections}
          visibleCategories={visibleCategories}
          connectFromId={connectFromId}
          onNodeClick={handleNodeClick}
        />
        <p className="stage-hint">
          Drag the canvas · scroll to zoom · click a node to start a connection,
          click another to finish
        </p>
      </main>
    </div>
  );
}

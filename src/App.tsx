import { useCallback, useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { CategoryFilters } from "./components/CategoryFilters";
import { NetworkGraph } from "./components/NetworkGraph";
import { Sidebar } from "./components/Sidebar";
import { useAuth } from "./hooks/useAuth";
import {
  apiAddConnection,
  apiAddPerson,
  apiUpdateCategory,
  fetchGraph,
} from "./hooks/useGraphApi";
import type { Category, Connection, Person } from "./types";
import { ALL_CATEGORIES } from "./types";

export default function App() {
  const auth = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Set<Category>>(
    () => new Set(ALL_CATEGORIES),
  );
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
    } catch (err) {
      setGraphError(
        err instanceof Error ? err.message : "Failed to load network data.",
      );
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadGraph();
  }, [reloadGraph]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("auth");
    if (!authStatus) return;
    if (authStatus === "ok") {
      flash(
        params.get("edit") === "0"
          ? "Signed in — view only (missing editor role)."
          : "Signed in with Discord.",
      );
      void auth.refresh();
    } else if (authStatus === "error") {
      flash(`Discord sign-in failed (${params.get("reason") ?? "unknown"}).`);
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [auth, flash]);

  const handleAddPerson = useCallback(
    async (draft: Omit<Person, "id">) => {
      if (!auth.canEdit) {
        flash("Sign in with the editor Discord role to add people.");
        return;
      }
      try {
        const person = await apiAddPerson(draft);
        setPeople((prev) => [...prev, person]);
        flash(`Added ${person.name}.`);
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not add person.");
      }
    },
    [auth.canEdit, flash],
  );

  const handleUpdateCategory = useCallback(
    async (personId: string, category: Category) => {
      if (!auth.canEdit) {
        flash("Sign in with the editor Discord role to edit categories.");
        return;
      }
      try {
        const person = await apiUpdateCategory(personId, category);
        setPeople((prev) =>
          prev.map((p) => (p.id === person.id ? person : p)),
        );
        flash(`Updated ${person.name} → ${category}.`);
      } catch (err) {
        flash(
          err instanceof Error ? err.message : "Could not update category.",
        );
      }
    },
    [auth.canEdit, flash],
  );

  const handleCreateConnection = useCallback(
    async (sourceId: string, targetId: string) => {
      if (!auth.canEdit) {
        flash("Sign in with the editor Discord role to draw connections.");
        return;
      }
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
      try {
        const connection = await apiAddConnection(sourceId, targetId);
        setConnections((prev) => [...prev, connection]);
        setConnectFromId(null);
        const a = people.find((p) => p.id === sourceId)?.name ?? sourceId;
        const b = people.find((p) => p.id === targetId)?.name ?? targetId;
        flash(`Connected ${a} ↔ ${b}.`);
      } catch (err) {
        flash(
          err instanceof Error ? err.message : "Could not create connection.",
        );
      }
    },
    [auth.canEdit, connections, people, flash],
  );

  const handleNodeClick = useCallback(
    (personId: string) => {
      if (!auth.canEdit) return;
      if (!connectFromId) {
        setConnectFromId(personId);
        return;
      }
      if (connectFromId === personId) {
        setConnectFromId(null);
        return;
      }
      void handleCreateConnection(connectFromId, personId);
    },
    [auth.canEdit, connectFromId, handleCreateConnection],
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
          <p className="eyebrow">Lucky · Discord</p>
          <h1>The Wall of Shame</h1>
          <p className="tagline">
            Interactive community network map. Nodes are people, edges are
            connections.
          </p>
        </header>

        <AuthPanel
          loading={auth.loading}
          authenticated={auth.authenticated}
          canEdit={auth.canEdit}
          discordConfigured={auth.discordConfigured}
          roleGateConfigured={auth.roleGateConfigured}
          user={auth.user}
          error={auth.error}
          onLogout={() => {
            void auth.logout();
          }}
        />

        <Sidebar
          people={people}
          connectFromId={connectFromId}
          canEdit={auth.canEdit}
          onAddPerson={(draft) => {
            void handleAddPerson(draft);
          }}
          onUpdateCategory={(id, category) => {
            void handleUpdateCategory(id, category);
          }}
          onStartConnect={setConnectFromId}
          onCreateConnection={(source, target) => {
            void handleCreateConnection(source, target);
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
          <p className="stage-hint">Loading network…</p>
        ) : graphError ? (
          <p className="stage-hint error-text">{graphError}</p>
        ) : (
          <NetworkGraph
            people={people}
            connections={connections}
            visibleCategories={visibleCategories}
            connectFromId={auth.canEdit ? connectFromId : null}
            onNodeClick={handleNodeClick}
          />
        )}
        <p className="stage-hint">
          {auth.canEdit
            ? "Drag the canvas · scroll to zoom · click a node to start a connection, click another to finish"
            : "Drag the canvas · scroll to zoom · sign in with Discord (editor role) to edit"}
        </p>
      </main>
    </div>
  );
}

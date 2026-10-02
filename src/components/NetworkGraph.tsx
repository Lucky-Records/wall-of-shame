import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { NodeImageProgram } from "@sigma/node-image";
import type {
  Category,
  Connection,
  GraphPosition,
  Person,
  PersonDraft,
} from "../types";
import { CATEGORY_COLORS, PERSON_DRAG_MIME } from "../types";

interface NetworkGraphProps {
  people: Person[];
  connections: Connection[];
  visibleCategories: Set<Category>;
  connectFromId: string | null;
  positionHints: Record<string, GraphPosition>;
  onNodeClick: (personId: string) => void;
  onPersonDrop: (draft: PersonDraft, position: GraphPosition) => void;
}

function seededPosition(id: string, index: number, total: number) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + (hash % 100) / 100;
  const radius = 80 + (hash % 120);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function parsePersonDraft(raw: string): PersonDraft | null {
  try {
    const data = JSON.parse(raw) as Partial<PersonDraft>;
    if (
      typeof data.name !== "string" ||
      typeof data.avatarUrl !== "string" ||
      typeof data.profileUrl !== "string" ||
      typeof data.category !== "string" ||
      typeof data.platform !== "string"
    ) {
      return null;
    }
    if (
      data.category !== "Streamer" &&
      data.category !== "Mod" &&
      data.category !== "Bubble"
    ) {
      return null;
    }
    if (
      data.platform !== "twitch" &&
      data.platform !== "twitter" &&
      data.platform !== "x" &&
      data.platform !== "unknown"
    ) {
      return null;
    }
    return {
      name: data.name,
      avatarUrl: data.avatarUrl,
      profileUrl: data.profileUrl,
      category: data.category,
      platform: data.platform,
    };
  } catch {
    return null;
  }
}

export function NetworkGraph({
  people,
  connections,
  visibleCategories,
  connectFromId,
  positionHints,
  onNodeClick,
  onPersonDrop,
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onPersonDropRef = useRef(onPersonDrop);
  const positionHintsRef = useRef(positionHints);
  onNodeClickRef.current = onNodeClick;
  onPersonDropRef.current = onPersonDrop;
  positionHintsRef.current = positionHints;

  const [dragOver, setDragOver] = useState(false);

  const visiblePeople = useMemo(
    () => people.filter((p) => visibleCategories.has(p.category)),
    [people, visibleCategories],
  );

  const visibleIds = useMemo(
    () => new Set(visiblePeople.map((p) => p.id)),
    [visiblePeople],
  );

  const visibleConnections = useMemo(
    () =>
      connections.filter(
        (c) => visibleIds.has(c.source) && visibleIds.has(c.target),
      ),
    [connections, visibleIds],
  );

  // Create sigma once
  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph();
    graphRef.current = graph;

    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelColor: { color: "#e2e8f0" },
      labelSize: 12,
      labelWeight: "600",
      labelFont: "Inter, system-ui, sans-serif",
      defaultNodeColor: "#94a3b8",
      defaultEdgeColor: "#475569",
      edgeLabelSize: 10,
      stagePadding: 40,
      nodeProgramClasses: {
        image: NodeImageProgram,
      },
    });

    sigmaRef.current = sigma;

    sigma.on("clickNode", ({ node }) => {
      onNodeClickRef.current(node);
    });

    return () => {
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, []);

  // Sync graph data + layout
  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    const existingNodes = new Set(graph.nodes());
    const nextNodes = new Set(visiblePeople.map((p) => p.id));
    const newlyAdded: string[] = [];

    for (const id of existingNodes) {
      if (!nextNodes.has(id)) graph.dropNode(id);
    }

    visiblePeople.forEach((person, index) => {
      const color = CATEGORY_COLORS[person.category];
      const highlighted = connectFromId === person.id;
      const size = highlighted ? 28 : 22;
      const hint = positionHintsRef.current[person.id];
      const seeded = seededPosition(person.id, index, visiblePeople.length);

      if (graph.hasNode(person.id)) {
        graph.mergeNodeAttributes(person.id, {
          label: person.name,
          color,
          size,
          image: person.avatarUrl,
          type: "image",
          category: person.category,
        });
        if (hint) {
          graph.mergeNodeAttributes(person.id, { x: hint.x, y: hint.y });
        }
      } else {
        const pos = hint ?? seeded;
        graph.addNode(person.id, {
          label: person.name,
          x: pos.x,
          y: pos.y,
          size,
          color,
          image: person.avatarUrl,
          type: "image",
          category: person.category,
        });
        newlyAdded.push(person.id);
      }
    });

    const existingEdges = new Set(graph.edges());
    const wantedEdgeKeys = new Set(
      visibleConnections.map((c) => `${c.source}::${c.target}`),
    );

    for (const edge of existingEdges) {
      const s = graph.source(edge);
      const t = graph.target(edge);
      const key = `${s}::${t}`;
      const rev = `${t}::${s}`;
      if (!wantedEdgeKeys.has(key) && !wantedEdgeKeys.has(rev)) {
        graph.dropEdge(edge);
      }
    }

    for (const conn of visibleConnections) {
      if (!graph.hasNode(conn.source) || !graph.hasNode(conn.target)) continue;
      if (
        graph.hasEdge(conn.source, conn.target) ||
        graph.hasEdge(conn.target, conn.source)
      ) {
        continue;
      }
      graph.addEdge(conn.source, conn.target, {
        size: 1.5,
        color: "#64748b",
      });
    }

    // Layout only when needed: first populate, or new nodes without drop hints
    const needsLayout =
      graph.order > 0 &&
      (newlyAdded.length === 0
        ? false
        : newlyAdded.every((id) => !positionHintsRef.current[id])
          ? newlyAdded.length > 0
          : newlyAdded.some((id) => !positionHintsRef.current[id]));

    const firstPopulate =
      newlyAdded.length > 0 && newlyAdded.length === graph.order;

    if (graph.order > 0 && (firstPopulate || needsLayout)) {
      // Don't pull drop-pinned nodes away — temporarily fix them
      const pinned = newlyAdded.filter((id) => positionHintsRef.current[id]);
      for (const id of pinned) {
        graph.setNodeAttribute(id, "fixed", true);
      }
      const sensible = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: firstPopulate && pinned.length === 0 ? 60 : 25,
        settings: {
          ...sensible,
          gravity: 1,
          scalingRatio: 10,
          slowDown: 5,
        },
      });
      for (const id of pinned) {
        const hint = positionHintsRef.current[id];
        if (hint) {
          graph.mergeNodeAttributes(id, { x: hint.x, y: hint.y, fixed: false });
        } else {
          graph.setNodeAttribute(id, "fixed", false);
        }
      }
    }

    sigma.refresh();
  }, [visiblePeople, visibleConnections, connectFromId, positionHints]);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (![...e.dataTransfer.types].includes(PERSON_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData(PERSON_DRAG_MIME);
    const draft = parsePersonDraft(raw);
    if (!draft) return;

    const sigma = sigmaRef.current;
    const wrap = wrapRef.current;
    if (!sigma || !wrap) {
      onPersonDropRef.current(draft, { x: 0, y: 0 });
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const viewport = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const graphPos = sigma.viewportToGraph(viewport);
    onPersonDropRef.current(draft, { x: graphPos.x, y: graphPos.y });
  }

  return (
    <div
      ref={wrapRef}
      className={`graph-dropzone${dragOver ? " is-dragover" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="graph-canvas" ref={containerRef} />
      {dragOver ? (
        <div className="graph-drop-hint" aria-hidden="true">
          Hier ablegen
        </div>
      ) : null}
    </div>
  );
}

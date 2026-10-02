import { useEffect, useMemo, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { NodeImageProgram } from "@sigma/node-image";
import type { Category, Connection, Person } from "../types";
import { CATEGORY_COLORS } from "../types";

interface NetworkGraphProps {
  people: Person[];
  connections: Connection[];
  visibleCategories: Set<Category>;
  connectFromId: string | null;
  onNodeClick: (personId: string) => void;
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

export function NetworkGraph({
  people,
  connections,
  visibleCategories,
  connectFromId,
  onNodeClick,
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

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

    for (const id of existingNodes) {
      if (!nextNodes.has(id)) graph.dropNode(id);
    }

    visiblePeople.forEach((person, index) => {
      const color = CATEGORY_COLORS[person.category];
      const highlighted = connectFromId === person.id;
      const size = highlighted ? 28 : 22;
      const pos = seededPosition(person.id, index, visiblePeople.length);

      if (graph.hasNode(person.id)) {
        graph.mergeNodeAttributes(person.id, {
          label: person.name,
          color,
          size,
          image: person.avatarUrl,
          type: "image",
          category: person.category,
        });
      } else {
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

    if (graph.order > 0) {
      const sensible = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: 60,
        settings: {
          ...sensible,
          gravity: 1,
          scalingRatio: 10,
          slowDown: 5,
        },
      });
    }

    sigma.refresh();
  }, [visiblePeople, visibleConnections, connectFromId]);

  return <div className="graph-canvas" ref={containerRef} />;
}

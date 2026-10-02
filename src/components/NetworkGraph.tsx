import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { MultiGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { NodeImageProgram } from "@sigma/node-image";
import {
  createDrawCurvedEdgeLabel,
  DEFAULT_EDGE_CURVATURE,
  DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS,
  EdgeCurvedArrowProgram,
  indexParallelEdgesIndex,
} from "@sigma/edge-curve";
import { EdgeArrowProgram } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import type {
  Connection,
  GraphPosition,
  Person,
  PersonDraft,
  Role,
} from "../types";
import {
  connectionEdgeColor,
  formatConnectionTags,
  PERSON_DRAG_MIME,
  personMatchesRoles,
  primaryRole,
  ROLE_COLORS,
  ROLE_LABELS,
} from "../types";

interface NetworkGraphProps {
  people: Person[];
  connections: Connection[];
  visibleRoles: Set<Role>;
  connectFromId: string | null;
  positionHints: Record<string, GraphPosition>;
  onNodeClick: (personId: string) => void;
  onPersonDrop: (draft: PersonDraft, position: GraphPosition) => void;
  onNodeMove: (personId: string, position: GraphPosition) => void;
}

type NodeLabelData = {
  label: string | null;
  x: number;
  y: number;
  size: number;
  color: string;
  roles?: Role[];
};

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

function hasCoords(
  value: { x?: number; y?: number } | undefined | null,
): value is GraphPosition {
  return (
    !!value &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function resolvePosition(
  person: Person,
  hints: Record<string, GraphPosition>,
  index: number,
  total: number,
): GraphPosition {
  if (hasCoords(person)) return { x: person.x, y: person.y };
  const hint = hints[person.id];
  if (hasCoords(hint)) return hint;
  return seededPosition(person.id, index, total);
}

function isRoleValue(value: unknown): value is Role {
  return (
    value === "Streamer" ||
    value === "Mod" ||
    value === "User" ||
    value === "Ex-Mod" ||
    value === "Headmod" ||
    value === "gebannt"
  );
}

function parsePersonDraft(raw: string): PersonDraft | null {
  try {
    const data = JSON.parse(raw) as Partial<PersonDraft> & {
      category?: unknown;
    };
    if (
      typeof data.name !== "string" ||
      typeof data.avatarUrl !== "string" ||
      typeof data.profileUrl !== "string" ||
      typeof data.platform !== "string"
    ) {
      return null;
    }
    let roles: Role[] = [];
    if (Array.isArray(data.roles)) {
      roles = data.roles.filter(isRoleValue);
    } else if (isRoleValue(data.category)) {
      roles = [data.category];
    } else if (data.category === "Bubble") {
      roles = ["User"];
    }
    if (!roles.length) return null;
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
      roles,
      platform: data.platform,
    };
  } catch {
    return null;
  }
}

function getCurvature(index: number, maxIndex: number): number {
  if (maxIndex <= 0) return DEFAULT_EDGE_CURVATURE;
  return DEFAULT_EDGE_CURVATURE * (index / Math.max(Math.abs(maxIndex), 1));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draw name + role badges directly under the avatar in viewport space.
 * Sigma already converts x/y/size to viewport pixels before calling this.
 * Icon, name and roles therefore move as one painted unit.
 */
function drawAttachedNodeLabel(
  context: CanvasRenderingContext2D,
  data: NodeLabelData,
  settings: Settings,
) {
  const name = data.label;
  if (!name) return;

  const roles = Array.isArray(data.roles) ? data.roles : [];
  const font = settings.labelFont || "Inter, system-ui, sans-serif";
  const nameSize = settings.labelSize || 12;
  const nameWeight = settings.labelWeight || "600";
  const nameColor =
    typeof settings.labelColor === "object" &&
    settings.labelColor &&
    "color" in settings.labelColor &&
    typeof settings.labelColor.color === "string"
      ? settings.labelColor.color
      : "#e2e8f0";

  const gap = 5;
  let cursorY = data.y + data.size + gap;

  context.save();
  context.textAlign = "center";
  context.textBaseline = "top";
  context.font = `${nameWeight} ${nameSize}px ${font}`;
  context.lineWidth = 3;
  context.strokeStyle = "rgba(11, 16, 32, 0.9)";
  context.fillStyle = nameColor;
  context.strokeText(name, data.x, cursorY);
  context.fillText(name, data.x, cursorY);
  cursorY += nameSize + 4;

  if (roles.length) {
    const badgeFontSize = Math.max(9, Math.round(nameSize * 0.85));
    const padX = 6;
    const padY = 2;
    const badgeH = badgeFontSize + padY * 2;
    const gapX = 4;
    context.font = `700 ${badgeFontSize}px ${font}`;

    const widths = roles.map(
      (role) => context.measureText(ROLE_LABELS[role]).width + padX * 2,
    );
    const totalW =
      widths.reduce((sum, w) => sum + w, 0) + gapX * Math.max(roles.length - 1, 0);
    let cursorX = data.x - totalW / 2;

    roles.forEach((role, i) => {
      const w = widths[i]!;
      const label = ROLE_LABELS[role];
      context.fillStyle = ROLE_COLORS[role];
      roundRect(context, cursorX, cursorY, w, badgeH, badgeH / 2);
      context.fill();
      context.fillStyle = "#0b1020";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, cursorX + w / 2, cursorY + badgeH / 2);
      cursorX += w + gapX;
    });
  }

  context.restore();
}

export function NetworkGraph({
  people,
  connections,
  visibleRoles,
  connectFromId,
  positionHints,
  onNodeClick,
  onPersonDrop,
  onNodeMove,
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<MultiGraph | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onPersonDropRef = useRef(onPersonDrop);
  const onNodeMoveRef = useRef(onNodeMove);
  const positionHintsRef = useRef(positionHints);
  const draggedNodeRef = useRef<string | null>(null);
  const dragMovedRef = useRef(false);
  const skipClickRef = useRef(false);
  onNodeClickRef.current = onNodeClick;
  onPersonDropRef.current = onPersonDrop;
  onNodeMoveRef.current = onNodeMove;
  positionHintsRef.current = positionHints;

  const [dragOver, setDragOver] = useState(false);
  const [draggingNode, setDraggingNode] = useState(false);

  const visiblePeople = useMemo(
    () => people.filter((p) => personMatchesRoles(p, visibleRoles)),
    [people, visibleRoles],
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

  // Create sigma once + node drag handlers
  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new MultiGraph({ type: "directed", multi: true });
    graphRef.current = graph;

    const sigma = new Sigma(graph, containerRef.current, {
      allowInvalidContainer: true,
      // Name + roles painted under the avatar in the same canvas pass
      renderLabels: true,
      renderEdgeLabels: true,
      labelColor: { color: "#e2e8f0" },
      labelSize: 12,
      labelWeight: "600",
      labelFont: "Inter, system-ui, sans-serif",
      labelRenderedSizeThreshold: 0,
      labelDensity: 2,
      defaultNodeColor: "#94a3b8",
      defaultEdgeColor: "#475569",
      defaultEdgeType: "straight",
      edgeLabelSize: 11,
      edgeLabelWeight: "600",
      edgeLabelFont: "Inter, system-ui, sans-serif",
      edgeLabelColor: { color: "#cbd5e1" },
      stagePadding: 40,
      nodeProgramClasses: {
        image: NodeImageProgram,
      },
      edgeProgramClasses: {
        straight: EdgeArrowProgram,
        curved: EdgeCurvedArrowProgram,
      },
      defaultDrawNodeLabel: drawAttachedNodeLabel,
      defaultDrawEdgeLabel: createDrawCurvedEdgeLabel(
        DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS,
      ),
    });

    sigmaRef.current = sigma;

    function endNodeDrag() {
      const nodeId = draggedNodeRef.current;
      if (!nodeId || !graphRef.current) {
        draggedNodeRef.current = null;
        dragMovedRef.current = false;
        sigma.setSetting("enableCameraPanning", true);
        setDraggingNode(false);
        return;
      }

      const moved = dragMovedRef.current;
      const x = graphRef.current.getNodeAttribute(nodeId, "x") as number;
      const y = graphRef.current.getNodeAttribute(nodeId, "y") as number;
      draggedNodeRef.current = null;
      dragMovedRef.current = false;
      sigma.setSetting("enableCameraPanning", true);
      setDraggingNode(false);

      if (moved && Number.isFinite(x) && Number.isFinite(y)) {
        skipClickRef.current = true;
        onNodeMoveRef.current(nodeId, { x, y });
      }
    }

    sigma.on("downNode", ({ node, event }) => {
      draggedNodeRef.current = node;
      dragMovedRef.current = false;
      skipClickRef.current = false;
      sigma.setSetting("enableCameraPanning", false);
      setDraggingNode(true);
      event.preventSigmaDefault();
    });

    sigma.on("moveBody", ({ event }) => {
      const nodeId = draggedNodeRef.current;
      if (!nodeId || !graphRef.current) return;
      const pos = sigma.viewportToGraph({ x: event.x, y: event.y });
      graphRef.current.setNodeAttribute(nodeId, "x", pos.x);
      graphRef.current.setNodeAttribute(nodeId, "y", pos.y);
      dragMovedRef.current = true;
      event.preventSigmaDefault();
      // Refresh so attached canvas labels track the dragged avatar
      sigma.refresh({ skipIndexation: true });
    });

    sigma.on("upNode", () => {
      endNodeDrag();
    });

    sigma.on("upStage", () => {
      if (draggedNodeRef.current) endNodeDrag();
    });

    sigma.on("clickNode", ({ node }) => {
      if (skipClickRef.current) {
        skipClickRef.current = false;
        return;
      }
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

    // Don't clobber a live drag
    if (draggedNodeRef.current) return;

    const existingNodes = new Set(graph.nodes());
    const nextNodes = new Set(visiblePeople.map((p) => p.id));
    const newlyAdded: string[] = [];

    for (const id of existingNodes) {
      if (!nextNodes.has(id)) graph.dropNode(id);
    }

    visiblePeople.forEach((person, index) => {
      const main = primaryRole(person.roles);
      const color = ROLE_COLORS[main];
      const highlighted = connectFromId === person.id;
      const size = highlighted ? 28 : 22;
      const pos = resolvePosition(
        person,
        positionHintsRef.current,
        index,
        visiblePeople.length,
      );
      const pinned =
        hasCoords(person) || hasCoords(positionHintsRef.current[person.id]);
      const label = person.name;

      if (graph.hasNode(person.id)) {
        graph.mergeNodeAttributes(person.id, {
          label,
          color,
          size,
          image: person.avatarUrl,
          type: "image",
          roles: person.roles,
          forceLabel: true,
        });
        if (pinned) {
          graph.mergeNodeAttributes(person.id, { x: pos.x, y: pos.y });
        }
      } else {
        graph.addNode(person.id, {
          label,
          x: pos.x,
          y: pos.y,
          size,
          color,
          image: person.avatarUrl,
          type: "image",
          roles: person.roles,
          forceLabel: true,
        });
        newlyAdded.push(person.id);
      }
    });

    // Rebuild edges from scratch so parallel/directed state stays correct
    for (const edge of graph.edges()) {
      graph.dropEdge(edge);
    }

    function edgeAttrs(conn: Connection) {
      const kinds = Array.isArray(conn.kinds) ? conn.kinds : [];
      const roles = Array.isArray(conn.roles) ? conn.roles : [];
      return {
        size: 2.4,
        color: connectionEdgeColor(kinds, roles),
        label: formatConnectionTags(kinds, roles),
        kinds,
        roles,
        type: "straight" as const,
        forceLabel: true,
      };
    }

    for (const conn of visibleConnections) {
      if (!graph.hasNode(conn.source) || !graph.hasNode(conn.target)) continue;
      graph.addEdgeWithKey(conn.id, conn.source, conn.target, edgeAttrs(conn));
    }

    indexParallelEdgesIndex(graph, {
      edgeIndexAttribute: "parallelIndex",
      edgeMinIndexAttribute: "parallelMinIndex",
      edgeMaxIndexAttribute: "parallelMaxIndex",
    });

    graph.forEachEdge(
      (
        edge,
        {
          parallelIndex,
          parallelMinIndex,
          parallelMaxIndex,
        }: {
          parallelIndex?: number | null;
          parallelMinIndex?: number | null;
          parallelMaxIndex?: number | null;
        },
      ) => {
        if (typeof parallelMinIndex === "number") {
          graph.mergeEdgeAttributes(edge, {
            type: parallelIndex ? "curved" : "straight",
            curvature: getCurvature(
              parallelIndex ?? 0,
              parallelMaxIndex ?? 1,
            ),
          });
        } else if (typeof parallelIndex === "number") {
          graph.mergeEdgeAttributes(edge, {
            type: "curved",
            curvature: getCurvature(parallelIndex, parallelMaxIndex ?? 1),
          });
        } else {
          graph.setEdgeAttribute(edge, "type", "straight");
        }
      },
    );

    const unpinnedNew = newlyAdded.filter((id) => {
      const person = visiblePeople.find((p) => p.id === id);
      return (
        !hasCoords(person) && !hasCoords(positionHintsRef.current[id])
      );
    });

    const firstPopulate =
      newlyAdded.length > 0 && newlyAdded.length === graph.order;

    const needsLayout =
      graph.order > 0 &&
      (firstPopulate
        ? newlyAdded.some(
            (id) =>
              !hasCoords(visiblePeople.find((p) => p.id === id)) &&
              !hasCoords(positionHintsRef.current[id]),
          )
        : unpinnedNew.length > 0);

    if (needsLayout) {
      const pinnedIds = graph.nodes().filter((id) => {
        const person = visiblePeople.find((p) => p.id === id);
        return (
          hasCoords(person) || hasCoords(positionHintsRef.current[id])
        );
      });
      for (const id of pinnedIds) {
        graph.setNodeAttribute(id, "fixed", true);
      }
      const sensible = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: firstPopulate && pinnedIds.length === 0 ? 60 : 25,
        settings: {
          ...sensible,
          gravity: 1,
          scalingRatio: 10,
          slowDown: 5,
        },
      });
      for (const id of pinnedIds) {
        const person = visiblePeople.find((p) => p.id === id);
        const hint = positionHintsRef.current[id];
        const restore =
          (hasCoords(person) && { x: person.x, y: person.y }) ||
          (hasCoords(hint) ? hint : null);
        if (restore) {
          graph.mergeNodeAttributes(id, {
            x: restore.x,
            y: restore.y,
            fixed: false,
          });
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
      className={`graph-dropzone${dragOver ? " is-dragover" : ""}${
        draggingNode ? " is-nodedrag" : ""
      }`}
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

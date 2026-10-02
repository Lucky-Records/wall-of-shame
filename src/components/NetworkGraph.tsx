import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { MultiGraph } from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { NodeImageProgram } from "@sigma/node-image";
import {
  createEdgeCurveProgram,
  DEFAULT_EDGE_CURVATURE,
  indexParallelEdgesIndex,
} from "@sigma/edge-curve";
import {
  createEdgeArrowProgram,
  createEdgeDoubleArrowProgram,
} from "sigma/rendering";

/** ~56% larger arrow heads than sigma defaults (2.5 / 2); +25% over prior 3.125 / 2.5. */
const ARROW_HEAD = {
  lengthToThicknessRatio: 3.90625,
  widenessToThicknessRatio: 3.125,
} as const;
import type { Settings } from "sigma/settings";
import type {
  Connection,
  GraphPosition,
  Person,
  PersonDraft,
  Role,
} from "../types";
import {
  connectionTagSegments,
  isRole,
  PERSON_DRAG_MIME,
  personMatchesRoles,
  primaryRole,
  ROLE_COLORS,
  ROLE_LABELS,
  type ConnectionTagSegment,
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
  return isRole(value);
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


type DirectedStrand = {
  source: string;
  target: string;
  text: string;
  color: string;
};

type VisualStrand = DirectedStrand & {
  key: string;
  bidirectional: boolean;
};

/**
 * One visual strand per label between a pair of people.
 * Fren as a kind and Fren as a role are the same yellow label, so they must
 * not become two parallel curves. If that label exists in both directions,
 * draw a single curve with arrowheads on both ends. A label that exists in
 * only one direction stays a single arrow. Different labels (Fren vs
 * Streamerkollege) stay separate colored strands.
 * Storage remains directed connections; this is visual only.
 */
function visualStrands(connections: Connection[]): VisualStrand[] {
  const buckets = new Map<string, DirectedStrand[]>();
  for (const conn of connections) {
    const kinds = Array.isArray(conn.kinds) ? conn.kinds : [];
    const roles = Array.isArray(conn.roles) ? conn.roles : [];
    const tags = connectionTagSegments(kinds, roles);
    const strands: ConnectionTagSegment[] =
      tags.length > 0 ? tags : [{ text: "—", color: "#94a3b8" }];
    const seenOnConn = new Set<string>();
    for (const tag of strands) {
      // Kind "Fren" and role "Fren" on the same directed edge are one strand.
      if (seenOnConn.has(tag.text)) continue;
      seenOnConn.add(tag.text);
      const lo = conn.source < conn.target ? conn.source : conn.target;
      const hi = conn.source < conn.target ? conn.target : conn.source;
      const bucketKey = `${lo}\0${hi}\0${tag.text}`;
      const list = buckets.get(bucketKey);
      const strand: DirectedStrand = {
        source: conn.source,
        target: conn.target,
        text: tag.text,
        color: tag.color,
      };
      if (list) list.push(strand);
      else buckets.set(bucketKey, [strand]);
    }
  }

  const visual: VisualStrand[] = [];
  for (const [bucketKey, items] of buckets) {
    const [lo, hi] = bucketKey.split("\0");
    const forward = items.find((s) => s.source === lo && s.target === hi);
    const backward = items.find((s) => s.source === hi && s.target === lo);
    const tag = forward ?? backward ?? items[0];
    if (!tag || !lo || !hi) continue;
    if (forward && backward) {
      visual.push({
        key: `both__${lo}__${hi}__${tag.text}`,
        source: lo,
        target: hi,
        text: tag.text,
        color: tag.color,
        bidirectional: true,
      });
      continue;
    }
    visual.push({
      key: `dir__${tag.source}__${tag.target}__${tag.text}`,
      source: tag.source,
      target: tag.target,
      text: tag.text,
      color: tag.color,
      bidirectional: false,
    });
  }
  return visual;
}

function getCurvature(index: number, maxIndex: number): number {
  if (maxIndex <= 0) return DEFAULT_EDGE_CURVATURE;
  if (index < 0) return -getCurvature(-index, maxIndex);
  // Match @sigma/edge-curve parallel-edges example: spread strands clearly.
  const amplitude = 3.5;
  const maxCurvature =
    amplitude *
    (1 - Math.exp(-maxIndex / amplitude)) *
    DEFAULT_EDGE_CURVATURE;
  return (maxCurvature * index) / Math.max(maxIndex, 1e-6);
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

/**
 * Paint ONE strand label ON that strand's curve (Bezier t=0.5, middle baseline).
 *
 * Label drawing receives viewport coordinates (Y down). The curve shader applies
 * curvature in framed-graph space (Y up) and the camera matrix flips Y — so the
 * viewport control-point formula must match @sigma/edge-curve's label helper:
 *   anchor = mid + (diffY, -diffX) * curvature * orientation
 * Using the raw shader formula mid+(-diffY,diffX)*c here mirrors labels onto
 * the opposite parallel strand (Fren text on Mod line, orphan floats, etc.).
 *
 * Each parallel edge already carries a single label+color for its kind/role.
 */
function drawColoredEdgeLabel(
  context: CanvasRenderingContext2D,
  edgeData: {
    label?: string | null;
    size?: number;
    color?: string;
    curvature?: number;
  },
  sourceData: { x: number; y: number; size: number },
  targetData: { x: number; y: number; size: number },
  settings: Settings,
) {
  const text = edgeData.label?.trim();
  if (!text || text === "—") return;

  const color =
    typeof edgeData.color === "string" && edgeData.color
      ? edgeData.color
      : "#cbd5e1";

  const size = settings.edgeLabelSize || 11;
  const font = settings.edgeLabelFont || "Inter, system-ui, sans-serif";
  const weight = settings.edgeLabelWeight || "600";
  // 0 is valid (middle parallel strand) — do not fall back to DEFAULT
  const curvature =
    typeof edgeData.curvature === "number" ? edgeData.curvature : 0;

  const keepLabelUpright = true;
  const ltr = !keepLabelUpright || sourceData.x < targetData.x;
  const sourceX = ltr ? sourceData.x : targetData.x;
  const sourceY = ltr ? sourceData.y : targetData.y;
  const targetX = ltr ? targetData.x : sourceData.x;
  const targetY = ltr ? targetData.y : sourceData.y;
  const centerX = (sourceX + targetX) / 2;
  const centerY = (sourceY + targetY) / 2;
  const diffX = targetX - sourceX;
  const diffY = targetY - sourceY;
  const diff = Math.sqrt(diffX * diffX + diffY * diffY);
  if (!Number.isFinite(diff) || diff < 1) return;

  // Viewport-space control point (same as createDrawCurvedEdgeLabel)
  const orientation = ltr ? 1 : -1;
  const anchorX = centerX + diffY * curvature * orientation;
  const anchorY = centerY - diffX * curvature * orientation;

  // Bezier point + tangent at t = 0.5 (true curve midpoint on THIS strand)
  const t = 0.5;
  const mt = 1 - t;
  const midX =
    mt * mt * sourceX + 2 * mt * t * anchorX + t * t * targetX;
  const midY =
    mt * mt * sourceY + 2 * mt * t * anchorY + t * t * targetY;
  const tangentX =
    2 * mt * (anchorX - sourceX) + 2 * t * (targetX - anchorX);
  const tangentY =
    2 * mt * (anchorY - sourceY) + 2 * t * (targetY - anchorY);
  const angle = Math.atan2(tangentY, tangentX);

  context.save();
  context.font = `${weight} ${size}px ${font}`;
  context.textBaseline = "middle";
  context.textAlign = "left";

  const textW = context.measureText(text).width;

  // Skip if chord is shorter than the two node radii
  if (diff < sourceData.size + targetData.size + textW * 0.35) {
    context.restore();
    return;
  }

  context.translate(midX, midY);
  context.rotate(angle);

  // Compact backdrop centered on the stroke
  const padX = 4;
  const padY = 2;
  context.fillStyle = "rgba(11, 16, 32, 0.78)";
  roundRect(
    context,
    -textW / 2 - padX,
    -size / 2 - padY,
    textW + padX * 2,
    size + padY * 2,
    5,
  );
  context.fill();

  context.fillStyle = color;
  context.fillText(text, -textW / 2, 0);

  context.restore();
}

/**
 * Straight + curved edge programs share the same on-strand label painter.
 * Without passing drawLabel, @sigma/edge-curve would use its built-in drawer
 * (alphabetic baseline) which floats labels above the stroke — only extreme
 * curvatures looked "on the line". Our drawer centers every kind/role label
 * on its own parallel curve (textBaseline middle at Bezier t=0.5).
 */
const StraightArrowProgram = createEdgeArrowProgram(ARROW_HEAD);
const StraightDoubleArrowProgram = createEdgeDoubleArrowProgram(ARROW_HEAD);
const CurvedArrowProgram = createEdgeCurveProgram({
  arrowHead: { extremity: "target", ...ARROW_HEAD },
  drawLabel: drawColoredEdgeLabel,
});
const CurvedDoubleArrowProgram = createEdgeCurveProgram({
  arrowHead: { extremity: "both", ...ARROW_HEAD },
  drawLabel: drawColoredEdgeLabel,
});

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
        straight: StraightArrowProgram,
        "straight-both": StraightDoubleArrowProgram,
        curved: CurvedArrowProgram,
        "curved-both": CurvedDoubleArrowProgram,
      },
      defaultDrawNodeLabel: drawAttachedNodeLabel,
      defaultDrawEdgeLabel: drawColoredEdgeLabel,
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

    // One visual strand per kind/role. Reciprocal pairs of the same label
    // (A→B Fren and B→A Fren) collapse to one line with arrowheads on both ends.
    // Different kinds stay separate colored strands. Directed storage is unchanged.
    const strands = visualStrands(visibleConnections).filter(
      (strand) => graph.hasNode(strand.source) && graph.hasNode(strand.target),
    );
    const pairCounts = new Map<string, number>();
    for (const strand of strands) {
      const lo = strand.source < strand.target ? strand.source : strand.target;
      const hi = strand.source < strand.target ? strand.target : strand.source;
      const pair = `${lo}\0${hi}`;
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
    for (const strand of strands) {
      const lo = strand.source < strand.target ? strand.source : strand.target;
      const hi = strand.source < strand.target ? strand.target : strand.source;
      const n = pairCounts.get(`${lo}\0${hi}`) ?? 1;
      const hasLabel = strand.text !== "—";
      graph.addEdgeWithKey(strand.key, strand.source, strand.target, {
        size: n > 1 ? 2.0 : 2.4,
        color: strand.color,
        label: hasLabel ? strand.text : null,
        type: strand.bidirectional ? "straight-both" : "straight",
        bidirectional: strand.bidirectional,
        forceLabel: hasLabel,
      });
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
          bidirectional,
        }: {
          parallelIndex?: number | null;
          parallelMinIndex?: number | null;
          parallelMaxIndex?: number | null;
          bidirectional?: boolean;
        },
      ) => {
        const curvedType = bidirectional ? "curved-both" : "curved";
        const straightType = bidirectional ? "straight-both" : "straight";
        if (typeof parallelMinIndex === "number") {
          const idx = parallelIndex ?? 0;
          // Always curved when parallels exist so each label sits on its strand
          // (index 0 may have curvature 0 = straight Bezier, still same painter).
          graph.mergeEdgeAttributes(edge, {
            type: curvedType,
            curvature: getCurvature(idx, parallelMaxIndex ?? 1),
          });
        } else if (typeof parallelIndex === "number") {
          graph.mergeEdgeAttributes(edge, {
            type: curvedType,
            curvature: getCurvature(parallelIndex, parallelMaxIndex ?? 1),
          });
        } else {
          graph.mergeEdgeAttributes(edge, {
            type: straightType,
            curvature: 0,
          });
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

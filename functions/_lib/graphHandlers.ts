import { jsonResponse, readJsonBody } from "./http.ts";
import { notifyGraphMutation, type NotifyEnv } from "./notify.ts";
import {
  allocatePersonId,
  DEFAULT_CONNECTION_KIND,
  isConnection,
  isFiniteCoord,
  isPerson,
  normalizeEdgeRoles,
  normalizeKinds,
  normalizeRoles,
  withCoords,
  type Connection,
  type GraphStore,
  type Person,
  type Role,
} from "./graphStore.ts";

export async function handleGraphGet(store: GraphStore): Promise<Response> {
  const data = await store.get();
  return jsonResponse({ ok: true, ...data });
}

function parseRolesFromBody(body: Record<string, unknown>): Role[] | null {
  if (body.roles !== undefined) {
    const roles = normalizeRoles(body.roles, body.category);
    return roles.length ? roles : null;
  }
  if (body.category !== undefined) {
    const roles = normalizeRoles(undefined, body.category);
    return roles.length ? roles : null;
  }
  return null;
}

export async function handlePeoplePost(
  request: Request,
  store: GraphStore,
  env?: NotifyEnv,
): Promise<Response> {
  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!body) {
    return jsonResponse({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const avatarUrl =
    typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";
  const profileUrl =
    typeof body.profileUrl === "string" ? body.profileUrl.trim() : "";
  const platform = body.platform;
  const roles = parseRolesFromBody(body);

  if (
    !name ||
    !roles ||
    !avatarUrl ||
    !profileUrl ||
    typeof platform !== "string"
  ) {
    return jsonResponse(
      { ok: false, error: "Missing or invalid person fields (roles required)." },
      { status: 400 },
    );
  }

  const candidate: Omit<Person, "id"> & { id?: string } = {
    name,
    roles,
    avatarUrl,
    profileUrl,
    platform: platform as Person["platform"],
  };

  if (!isPerson({ ...candidate, id: "tmp" })) {
    return jsonResponse(
      { ok: false, error: "Invalid person payload." },
      { status: 400 },
    );
  }

  const data = await store.get();
  if (data.people.some((p) => p.profileUrl === candidate.profileUrl)) {
    return jsonResponse(
      { ok: false, error: "That profile is already on the board." },
      { status: 409 },
    );
  }

  const person: Person = withCoords(
    {
      id: allocatePersonId(candidate.name, data.people),
      name: candidate.name,
      roles: candidate.roles,
      avatarUrl: candidate.avatarUrl,
      profileUrl: candidate.profileUrl,
      platform: candidate.platform,
    },
    body.x,
    body.y,
  );

  data.people.push(person);
  await store.set(data);
  await notifyGraphMutation(env);
  return jsonResponse({ ok: true, person }, { status: 201 });
}

export async function handlePersonPatch(
  request: Request,
  store: GraphStore,
  personId: string,
  env?: NotifyEnv,
): Promise<Response> {
  const body = await readJsonBody<{
    roles?: unknown;
    category?: unknown;
    x?: unknown;
    y?: unknown;
  }>(request);
  if (!body) {
    return jsonResponse({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const hasRoles =
    body.roles !== undefined || body.category !== undefined;
  const hasPosition = body.x !== undefined || body.y !== undefined;

  if (!hasRoles && !hasPosition) {
    return jsonResponse(
      { ok: false, error: "Provide roles and/or x,y position." },
      { status: 400 },
    );
  }

  let nextRoles: Role[] | null = null;
  if (hasRoles) {
    nextRoles = parseRolesFromBody(body as Record<string, unknown>);
    if (!nextRoles) {
      return jsonResponse(
        { ok: false, error: "Provide at least one valid role." },
        { status: 400 },
      );
    }
  }

  if (hasPosition && !(isFiniteCoord(body.x) && isFiniteCoord(body.y))) {
    return jsonResponse(
      { ok: false, error: "Position requires finite x and y." },
      { status: 400 },
    );
  }

  const data = await store.get();
  const idx = data.people.findIndex((p) => p.id === personId);
  if (idx === -1) {
    return jsonResponse({ ok: false, error: "Person not found." }, { status: 404 });
  }

  let updated: Person = {
    ...data.people[idx]!,
    roles: [...data.people[idx]!.roles],
  };
  if (nextRoles) {
    updated = { ...updated, roles: nextRoles };
  }
  if (hasPosition && isFiniteCoord(body.x) && isFiniteCoord(body.y)) {
    updated = { ...updated, x: body.x, y: body.y };
  }
  data.people[idx] = updated;
  await store.set(data);
  // Position-only moves should not spam Discord #liste
  if (hasRoles) {
    await notifyGraphMutation(env);
  }
  return jsonResponse({ ok: true, person: updated });
}

export async function handleConnectionsPost(
  request: Request,
  store: GraphStore,
  env?: NotifyEnv,
): Promise<Response> {
  const body = await readJsonBody<{
    source?: unknown;
    target?: unknown;
    kind?: unknown;
    kinds?: unknown;
    roles?: unknown;
  }>(request);
  const source = typeof body?.source === "string" ? body.source : "";
  const target = typeof body?.target === "string" ? body.target : "";
  let kinds = normalizeKinds(body?.kinds, body?.kind);
  const roles = normalizeEdgeRoles(body?.roles);
  if (kinds.length === 0 && roles.length === 0) {
    kinds = [DEFAULT_CONNECTION_KIND];
  }

  if (!source || !target) {
    return jsonResponse(
      { ok: false, error: "source and target are required." },
      { status: 400 },
    );
  }
  if (source === target) {
    return jsonResponse(
      { ok: false, error: "Cannot connect a person to themselves." },
      { status: 400 },
    );
  }

  const data = await store.get();
  if (
    !data.people.some((p) => p.id === source) ||
    !data.people.some((p) => p.id === target)
  ) {
    return jsonResponse(
      { ok: false, error: "Both people must exist on the board." },
      { status: 400 },
    );
  }

  // One directed edge A→B: merge tags if it already exists.
  const existingIdx = data.connections.findIndex(
    (c) => c.source === source && c.target === target,
  );
  if (existingIdx >= 0) {
    const prev = data.connections[existingIdx]!;
    const mergedKinds = [...prev.kinds];
    for (const k of kinds) {
      if (!mergedKinds.includes(k)) mergedKinds.push(k);
    }
    const mergedRoles = [...prev.roles];
    for (const r of roles) {
      if (!mergedRoles.includes(r)) mergedRoles.push(r);
    }
    const updated: Connection = {
      ...prev,
      kinds: mergedKinds,
      roles: mergedRoles,
    };
    if (!isConnection(updated)) {
      return jsonResponse(
        { ok: false, error: "Invalid connection tags." },
        { status: 400 },
      );
    }
    data.connections[existingIdx] = updated;
    await store.set(data);
    await notifyGraphMutation(env);
    return jsonResponse({ ok: true, connection: updated, merged: true });
  }

  const connection: Connection = {
    id: `c-${source}-${target}-${Date.now()}`,
    source,
    target,
    kinds,
    roles,
  };
  if (!isConnection(connection)) {
    return jsonResponse(
      { ok: false, error: "Invalid connection." },
      { status: 400 },
    );
  }

  data.connections.push(connection);
  await store.set(data);
  await notifyGraphMutation(env);
  return jsonResponse({ ok: true, connection }, { status: 201 });
}

export async function handleConnectionPatch(
  request: Request,
  store: GraphStore,
  connectionId: string,
  env?: NotifyEnv,
): Promise<Response> {
  const body = await readJsonBody<{
    kinds?: unknown;
    kind?: unknown;
    roles?: unknown;
  }>(request);
  if (!body) {
    return jsonResponse({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const hasKinds = body.kinds !== undefined || body.kind !== undefined;
  const hasRoles = body.roles !== undefined;
  if (!hasKinds && !hasRoles) {
    return jsonResponse(
      { ok: false, error: "Provide kinds and/or roles." },
      { status: 400 },
    );
  }

  const data = await store.get();
  const idx = data.connections.findIndex((c) => c.id === connectionId);
  if (idx === -1) {
    return jsonResponse(
      { ok: false, error: "Connection not found." },
      { status: 404 },
    );
  }

  const prev = data.connections[idx]!;
  const nextKinds = hasKinds
    ? normalizeKinds(body.kinds, body.kind)
    : [...prev.kinds];
  const nextRoles = hasRoles
    ? normalizeEdgeRoles(body.roles)
    : [...prev.roles];

  // No tags left → remove the whole edge
  if (nextKinds.length === 0 && nextRoles.length === 0) {
    data.connections.splice(idx, 1);
    await store.set(data);
    await notifyGraphMutation(env);
    return jsonResponse({ ok: true, connection: prev, deleted: true });
  }

  const updated: Connection = {
    ...prev,
    kinds: nextKinds,
    roles: nextRoles,
  };
  if (!isConnection(updated)) {
    return jsonResponse(
      { ok: false, error: "Invalid connection tags." },
      { status: 400 },
    );
  }

  data.connections[idx] = updated;
  await store.set(data);
  await notifyGraphMutation(env);
  return jsonResponse({ ok: true, connection: updated });
}

export async function handleConnectionDelete(
  request: Request,
  store: GraphStore,
  connectionId: string,
  env?: NotifyEnv,
): Promise<Response> {
  void request;
  const data = await store.get();
  const idx = data.connections.findIndex((c) => c.id === connectionId);
  if (idx === -1) {
    return jsonResponse(
      { ok: false, error: "Connection not found." },
      { status: 404 },
    );
  }

  const removed = data.connections[idx]!;
  data.connections.splice(idx, 1);
  await store.set(data);
  await notifyGraphMutation(env);
  return jsonResponse({ ok: true, connection: removed });
}

export async function handlePersonDelete(
  request: Request,
  store: GraphStore,
  personId: string,
  env?: NotifyEnv,
): Promise<Response> {
  void request;
  const data = await store.get();
  const idx = data.people.findIndex((p) => p.id === personId);
  if (idx === -1) {
    return jsonResponse({ ok: false, error: "Person not found." }, { status: 404 });
  }

  const removed = data.people[idx]!;
  data.people.splice(idx, 1);
  data.connections = data.connections.filter(
    (c) => c.source !== personId && c.target !== personId,
  );
  await store.set(data);
  await notifyGraphMutation(env);
  return jsonResponse({ ok: true, person: removed });
}

// silence unused in case callers check role helpers

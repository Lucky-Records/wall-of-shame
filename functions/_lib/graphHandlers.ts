import { jsonResponse, readJsonBody } from "./http.ts";
import { notifyGraphMutation, type NotifyEnv } from "./notify.ts";
import {
  allocatePersonId,
  DEFAULT_CONNECTION_KIND,
  isCategory,
  isConnection,
  isConnectionKind,
  isFiniteCoord,
  isPerson,
  withCoords,
  type Connection,
  type ConnectionKind,
  type GraphStore,
  type Person,
} from "./graphStore.ts";

export async function handleGraphGet(store: GraphStore): Promise<Response> {
  const data = await store.get();
  return jsonResponse({ ok: true, ...data });
}

export async function handlePeoplePost(
  request: Request,
  store: GraphStore,
  env?: NotifyEnv,
): Promise<Response> {
  const body = await readJsonBody<Partial<Person>>(request);
  if (!body) {
    return jsonResponse({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const draft = {
    name: typeof body.name === "string" ? body.name.trim() : "",
    category: body.category,
    avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "",
    profileUrl:
      typeof body.profileUrl === "string" ? body.profileUrl.trim() : "",
    platform: body.platform,
    x: body.x,
    y: body.y,
  };

  if (
    !draft.name ||
    !isCategory(draft.category) ||
    !draft.avatarUrl ||
    !draft.profileUrl ||
    typeof draft.platform !== "string"
  ) {
    return jsonResponse(
      { ok: false, error: "Missing or invalid person fields." },
      { status: 400 },
    );
  }

  const candidate: Omit<Person, "id"> & { id?: string } = {
    name: draft.name,
    category: draft.category,
    avatarUrl: draft.avatarUrl,
    profileUrl: draft.profileUrl,
    platform: draft.platform as Person["platform"],
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
      category: candidate.category,
      avatarUrl: candidate.avatarUrl,
      profileUrl: candidate.profileUrl,
      platform: candidate.platform,
    },
    draft.x,
    draft.y,
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
    category?: unknown;
    x?: unknown;
    y?: unknown;
  }>(request);
  if (!body) {
    return jsonResponse({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const hasCategory = body.category !== undefined;
  const hasPosition =
    body.x !== undefined || body.y !== undefined;

  if (!hasCategory && !hasPosition) {
    return jsonResponse(
      { ok: false, error: "Provide category and/or x,y position." },
      { status: 400 },
    );
  }
  if (hasCategory && !isCategory(body.category)) {
    return jsonResponse(
      { ok: false, error: "Provide a valid category." },
      { status: 400 },
    );
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

  let updated: Person = { ...data.people[idx]! };
  if (hasCategory && isCategory(body.category)) {
    updated = { ...updated, category: body.category };
  }
  if (hasPosition && isFiniteCoord(body.x) && isFiniteCoord(body.y)) {
    updated = { ...updated, x: body.x, y: body.y };
  }
  data.people[idx] = updated;
  await store.set(data);
  // Position-only moves should not spam Discord #liste
  if (hasCategory) {
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
  }>(request);
  const source = typeof body?.source === "string" ? body.source : "";
  const target = typeof body?.target === "string" ? body.target : "";
  const kind: ConnectionKind = isConnectionKind(body?.kind)
    ? body.kind
    : DEFAULT_CONNECTION_KIND;

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

  const exists = data.connections.some(
    (c) =>
      (c.source === source && c.target === target) ||
      (c.source === target && c.target === source),
  );
  if (exists) {
    return jsonResponse(
      { ok: false, error: "Those two are already connected." },
      { status: 409 },
    );
  }

  const connection: Connection = {
    id: `c-${source}-${target}-${Date.now()}`,
    source,
    target,
    kind,
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

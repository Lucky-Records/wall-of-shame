import { jsonResponse, readJsonBody } from "./http.ts";
import {
  allocatePersonId,
  isCategory,
  isConnection,
  isPerson,
  type Connection,
  type GraphStore,
  type Person,
} from "./graphStore.ts";
import { getSessionFromRequest, type SessionPayload } from "./session.ts";
import type { DiscordEnv } from "./discord.ts";

async function requireEditor(
  request: Request,
  env: DiscordEnv,
): Promise<SessionPayload | Response> {
  const session = await getSessionFromRequest(request, env.SESSION_SECRET);
  if (!session) {
    return jsonResponse(
      { ok: false, error: "Sign in with Discord to edit the board." },
      { status: 401 },
    );
  }
  if (!session.canEdit) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Your Discord account is signed in but does not have the editor role.",
      },
      { status: 403 },
    );
  }
  return session;
}

export async function handleGraphGet(store: GraphStore): Promise<Response> {
  const data = await store.get();
  return jsonResponse({ ok: true, ...data });
}

export async function handlePeoplePost(
  request: Request,
  env: DiscordEnv,
  store: GraphStore,
): Promise<Response> {
  const auth = await requireEditor(request, env);
  if (auth instanceof Response) return auth;

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

  const person: Person = {
    id: allocatePersonId(candidate.name, data.people),
    name: candidate.name,
    category: candidate.category,
    avatarUrl: candidate.avatarUrl,
    profileUrl: candidate.profileUrl,
    platform: candidate.platform,
  };

  data.people.push(person);
  await store.set(data);
  return jsonResponse({ ok: true, person }, { status: 201 });
}

export async function handlePersonPatch(
  request: Request,
  env: DiscordEnv,
  store: GraphStore,
  personId: string,
): Promise<Response> {
  const auth = await requireEditor(request, env);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<{ category?: unknown }>(request);
  if (!body || !isCategory(body.category)) {
    return jsonResponse(
      { ok: false, error: "Provide a valid category." },
      { status: 400 },
    );
  }

  const data = await store.get();
  const idx = data.people.findIndex((p) => p.id === personId);
  if (idx === -1) {
    return jsonResponse({ ok: false, error: "Person not found." }, { status: 404 });
  }

  const updated: Person = { ...data.people[idx]!, category: body.category };
  data.people[idx] = updated;
  await store.set(data);
  return jsonResponse({ ok: true, person: updated });
}

export async function handleConnectionsPost(
  request: Request,
  env: DiscordEnv,
  store: GraphStore,
): Promise<Response> {
  const auth = await requireEditor(request, env);
  if (auth instanceof Response) return auth;

  const body = await readJsonBody<{ source?: unknown; target?: unknown }>(
    request,
  );
  const source = typeof body?.source === "string" ? body.source : "";
  const target = typeof body?.target === "string" ? body.target : "";

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
  };
  if (!isConnection(connection)) {
    return jsonResponse(
      { ok: false, error: "Invalid connection." },
      { status: 400 },
    );
  }

  data.connections.push(connection);
  await store.set(data);
  return jsonResponse({ ok: true, connection }, { status: 201 });
}

import type { Category, Connection, Person } from "../types";

export async function fetchGraph(): Promise<{
  people: Person[];
  connections: Connection[];
}> {
  const res = await fetch("/api/graph", { credentials: "include" });
  const data = (await res.json()) as {
    ok?: boolean;
    people?: Person[];
    connections?: Connection[];
    error?: string;
  };
  if (!res.ok || !data.ok || !data.people || !data.connections) {
    throw new Error(data.error ?? `Failed to load graph (${res.status}).`);
  }
  return { people: data.people, connections: data.connections };
}

export async function apiAddPerson(
  person: Omit<Person, "id">,
): Promise<Person> {
  const res = await fetch("/api/graph/people", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(person),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    person?: Person;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.person) {
    throw new Error(data.error ?? `Add person failed (${res.status}).`);
  }
  return data.person;
}

export async function apiUpdateCategory(
  personId: string,
  category: Category,
): Promise<Person> {
  const res = await fetch(`/api/graph/people/${encodeURIComponent(personId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    person?: Person;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.person) {
    throw new Error(data.error ?? `Update category failed (${res.status}).`);
  }
  return data.person;
}

export async function apiAddConnection(
  source: string,
  target: string,
): Promise<Connection> {
  const res = await fetch("/api/graph/connections", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, target }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    connection?: Connection;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.connection) {
    throw new Error(data.error ?? `Add connection failed (${res.status}).`);
  }
  return data.connection;
}

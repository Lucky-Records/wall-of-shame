export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

export function redirectResponse(
  location: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(null, {
    status: init.status ?? 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function appendSetCookie(
  headers: Record<string, string>,
  cookie: string,
): Record<string, string> {
  const existing = headers["Set-Cookie"];
  if (!existing) {
    return { ...headers, "Set-Cookie": cookie };
  }
  // Multiple Set-Cookie: join with newline; CF Workers accept array via Headers.append.
  // Callers that need multiple cookies should use Headers objects.
  return { ...headers, "Set-Cookie": `${existing}\n${cookie}` };
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

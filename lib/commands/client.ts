// lib/commands/client.ts — the one way client components mutate anything.
// Each invocation serializes a UUID request ID once, so any transport retry
// reuses the identical request body while the server adds correlation metadata.

export async function command(breweryId: string, name: string, input: unknown) {
  const requestId = crypto.randomUUID();
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ breweryId, name, input, requestId }),
  });
  const json = await res.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: { message?: string } } | null;
  // Proxies and gateways can answer with HTML or an empty body; only trust the envelope.
  // A lapsed session answers 401: the Session expired screen (login) takes over; queued writes are Program 15.
  if (res.status === 401) { location.assign(new URL("/login?error=expired", location.origin).href); throw new Error("session expired"); }
  if (typeof json?.ok !== "boolean") throw new Error(`malformed response (${res.status})`);
  if (!json.ok) throw new Error(json.error?.message ?? `request failed (${res.status})`);
  return json.data;
}

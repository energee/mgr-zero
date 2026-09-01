// lib/commands/client.ts — the one way client components mutate anything.
// Each invocation serializes a UUID request ID once, so any transport retry
// reuses the identical request body while the server adds correlation metadata.
import type { CommandFailure, CommandSuccess } from "./registry";

export async function command(breweryId: string, name: string, input: unknown) {
  const requestId = crypto.randomUUID();
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ breweryId, name, input, requestId }),
  });
  const json: unknown = await res.json().catch(() => undefined);
  if (!isEnvelope(json)) throw new Error(`malformed response (${res.status})`);
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}

// Proxies and gateways can answer with HTML or an empty body; only trust the
// typed envelope the route writes.
function isEnvelope(v: unknown): v is CommandSuccess<unknown> | CommandFailure {
  if (typeof v !== "object" || v === null || !("ok" in v) || typeof v.ok !== "boolean") return false;
  if (v.ok) return "data" in v;
  return "error" in v && typeof v.error === "object" && v.error !== null
    && "message" in v.error && typeof v.error.message === "string";
}

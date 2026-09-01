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
  const json = await res.json() as CommandSuccess<unknown> | CommandFailure;
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}

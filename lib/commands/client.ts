// lib/commands/client.ts — the one way client components mutate anything.
// Posts to /api/command, which validates against the registered command's zod
// schema, enforces RLS/role checks via buildContext, and runs the handler.
export async function command(breweryId: string, name: string, input: unknown) {
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ breweryId, name, input }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

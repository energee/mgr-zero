// lib/commands/client.ts — the one way client components mutate anything.
// Callers may retain a request ID for an unchanged failed submission; ordinary
// three-argument calls still generate one UUID per invocation.
import type { CommandContextExpectation, CommandOrigin } from "./registry";

export const COMMAND_DATA_CHANGED = "mgr-command-data-changed";
function notifyDataChanged(breweryId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(COMMAND_DATA_CHANGED, { detail: { breweryId } }));
}

export class CommandResponseError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

export type CommandFailureDetail = {
  message: string;
  kind: "definitive" | "unknown";
  status?: number;
  code?: string;
};

export function classifyCommandFailure(error: unknown): CommandFailureDetail {
  const value = error as { message?: unknown; status?: unknown; code?: unknown } | null;
  const status = typeof value?.status === "number" ? value.status : undefined;
  const code = typeof value?.code === "string" ? value.code : undefined;
  const message = error instanceof Error ? error.message : "command failed";
  const definitive = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
  return { message, kind: definitive ? "definitive" : "unknown", ...(status === undefined ? {} : { status }), ...(code ? { code } : {}) };
}

export type CommandProvenance = { origin: Exclude<CommandOrigin, "chat"> }
  | { origin: "chat"; conversationId: string; previewToken: string };

export async function command(breweryId: string, name: string, input: unknown, requestId: string = crypto.randomUUID(), expectedContext?: CommandContextExpectation, provenance?: CommandProvenance, signal?: AbortSignal) {
  const res = await fetch("/api/command", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ breweryId, name, input, requestId, ...(expectedContext ? { expectedContext } : {}), ...provenance }),
  }).catch(error => {
    if (!signal) notifyDataChanged(breweryId);
    throw error;
  });
  const json = await res.json().catch(() => null) as { ok?: boolean; data?: unknown; requestId?: string; error?: { message?: string; code?: string } } | null;
  // Successful query envelopes omit requestId. Unknown outcomes may have
  // committed, so invalidate on failures too; never automatically retry writes.
  if ((!signal && !json?.ok) || (json?.ok && json.requestId)) notifyDataChanged(breweryId);
  // Proxies and gateways can answer with HTML or an empty body; only trust the envelope.
  // A lapsed session answers 401: the Session expired screen (login) takes over; queued writes are Program 15.
  // ponytail: the transport navigates because no shell-level session handler exists yet; a typed
  // SessionExpired the app shell catches is the upgrade path once one does
  if (res.status === 401) {
    const back = location.pathname.startsWith("/portal") ? "/portal/login?error=expired" : "/login?error=expired";
    location.assign(new URL(back, location.origin).href);
    throw new CommandResponseError("session expired", 401);
  }
  if (typeof json?.ok !== "boolean") throw new Error(`malformed response (${res.status})`);
  if (!json.ok) throw new CommandResponseError(json.error?.message ?? `request failed (${res.status})`, res.status, json.error?.code);
  return json.data;
}

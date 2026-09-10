import { z } from "zod";
import { CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";
import type { CommandContextExpectation } from "@/lib/commands/registry";
import { fermentationReadingInput, fermentationReadingOfflinePolicy } from "@/lib/composer/offline-policy";

export { fermentationReadingInput, fermentationReadingOfflinePolicy } from "@/lib/composer/offline-policy";

/** Shipped C4 array key, read once and migrated to collision-free row keys. */
export const OUTBOX_STORAGE_KEY = "mgr-offline-outbox:v1";
export const OUTBOX_ENTRY_PREFIX = "mgr-offline-outbox:v2:";
export const OUTBOX_RETIRED_PREFIX = "mgr-offline-outbox:v2-retired:";

const staffRole = z.enum(["admin", "sales", "warehouse", "brewer", "taproom"]);
const scopeSchema = z.object({ actorId: z.string().uuid(), breweryId: z.string().uuid(), role: staffRole }).strict();
const attemptSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  name: z.literal(fermentationReadingOfflinePolicy.name),
  label: z.string().min(1),
  input: fermentationReadingInput,
  requestId: z.string().uuid(),
  capturedAt: z.string().datetime({ offset: true }),
  scope: scopeSchema,
  origin: z.literal("ui"),
  conversationId: z.null(),
  state: z.enum(["queued", "uncertain", "fix", "permission_changed"]),
  attempts: z.number().int().nonnegative(),
  hadUncertainOutcome: z.boolean(),
  lastError: z.string().optional(),
}).strict().superRefine((entry, context) => {
  if (entry.id !== entry.requestId) context.addIssue({ code: "custom", message: "Outbox identity changed" });
  if (!fermentationReadingOfflinePolicy.roles.includes(entry.scope.role as "admin" | "brewer")) {
    context.addIssue({ code: "custom", message: "Command is not eligible for this role" });
  }
});

export type OfflineScope = z.infer<typeof scopeSchema>;
export type ReadingInput = z.infer<typeof fermentationReadingInput>;
export type OutboxAttempt = z.infer<typeof attemptSchema>;
type OutboxStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type OutboxTransport = (
  breweryId: string,
  name: typeof fermentationReadingOfflinePolicy.name,
  input: ReadingInput,
  requestId: string,
  expectedContext: CommandContextExpectation,
) => Promise<unknown>;
export type OutboxSendResult = { status: "sent" | "uncertain" | "fix" | "permission_changed" | "not_current"; entry?: OutboxAttempt };

const outboxSchema = z.array(attemptSchema).superRefine((entries, context) => {
  const ids = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (ids.has(entry.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate outbox request" });
    ids.add(entry.id);
  }
});
const sends = new WeakMap<object, Map<string, Promise<OutboxSendResult>>>();

function parseOutbox(raw: string | null) {
  if (raw === null) return [];
  try { return outboxSchema.parse(JSON.parse(raw)); }
  catch { throw new Error("Offline outbox could not be read. Nothing was sent or replaced."); }
}

function notifyOutboxChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("mgr-outbox-change"));
}

function entryKey(id: string) {
  return `${OUTBOX_ENTRY_PREFIX}${id}`;
}

function retiredKey(id: string) {
  return `${OUTBOX_RETIRED_PREFIX}${id}`;
}

function isRetired(storage: OutboxStorage, id: string) {
  return storage.getItem(retiredKey(id)) !== null;
}

function sameImmutableAttempt(a: OutboxAttempt, b: OutboxAttempt) {
  const immutable = (entry: OutboxAttempt) => ({
    version: entry.version, id: entry.id, name: entry.name, label: entry.label,
    input: entry.input, requestId: entry.requestId, capturedAt: entry.capturedAt,
    scope: entry.scope, origin: entry.origin, conversationId: entry.conversationId,
  });
  return JSON.stringify(immutable(a)) === JSON.stringify(immutable(b));
}

function writeAttempt(storage: OutboxStorage, entry: OutboxAttempt) {
  try {
    const parsed = attemptSchema.parse(entry);
    if (isRetired(storage, parsed.id)) return;
    storage.setItem(entryKey(parsed.id), JSON.stringify(parsed));
    // A different tab may retire the row between the first check and write.
    if (isRetired(storage, parsed.id)) storage.removeItem(entryKey(parsed.id));
    notifyOutboxChange();
  }
  catch { throw new Error("Could not save the offline outbox. Enable local storage and retry; no new request was sent."); }
}

function retireAttempt(storage: OutboxStorage, id: string) {
  try { storage.setItem(retiredKey(id), "retired"); }
  catch { throw new Error("Could not update the offline outbox. The saved request was retained."); }
  // The marker is authoritative if physical row cleanup is unavailable.
  try { storage.removeItem(entryKey(id)); } catch { /* ignored */ }
  notifyOutboxChange();
}

function storedAttempt(storage: OutboxStorage, id: string): OutboxAttempt | null {
  if (isRetired(storage, id)) return null;
  const raw = storage.getItem(entryKey(id));
  if (raw === null) return null;
  try {
    const parsed = attemptSchema.parse(JSON.parse(raw));
    if (parsed.id !== id) throw new Error("key mismatch");
    return parsed;
  } catch { throw new Error("Offline outbox row could not be read. Nothing was sent or replaced."); }
}

function migrateLegacyOutbox(storage: OutboxStorage) {
  const raw = storage.getItem(OUTBOX_STORAGE_KEY);
  if (raw === null) return;
  const legacy = parseOutbox(raw);
  for (const entry of legacy) {
    if (isRetired(storage, entry.id)) continue;
    const current = storedAttempt(storage, entry.id);
    if (current && !sameImmutableAttempt(current, entry)) throw new Error("Outbox request identity was already used.");
    if (!current) writeAttempt(storage, entry);
  }
  try { storage.removeItem(OUTBOX_STORAGE_KEY); notifyOutboxChange(); }
  catch { throw new Error("Could not update the offline outbox. The saved requests were retained."); }
}

export function readOutbox(storage: OutboxStorage): OutboxAttempt[] {
  migrateLegacyOutbox(storage);
  const entries: OutboxAttempt[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(OUTBOX_ENTRY_PREFIX)) continue;
    try {
      const entry = attemptSchema.parse(JSON.parse(storage.getItem(key) ?? ""));
      if (key === entryKey(entry.id) && !isRetired(storage, entry.id)) entries.push(entry);
    } catch { /* One malformed row cannot hide or replace valid siblings. */ }
  }
  return entries.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
}

export function createReadingAttempt(
  scope: OfflineScope,
  rawInput: ReadingInput,
  label: string,
  identity: { requestId?: string; capturedAt?: string } = {},
): OutboxAttempt {
  const requestId = identity.requestId ?? crypto.randomUUID();
  return attemptSchema.parse({
    version: 1, id: requestId, name: fermentationReadingOfflinePolicy.name, label,
    input: fermentationReadingInput.parse(rawInput), requestId,
    capturedAt: identity.capturedAt ?? new Date().toISOString(), scope,
    origin: "ui", conversationId: null, state: "queued", attempts: 0, hadUncertainOutcome: false,
  });
}

export function storeOutboxAttempt(storage: OutboxStorage, rawAttempt: OutboxAttempt) {
  if ((rawAttempt as { name?: unknown }).name !== fermentationReadingOfflinePolicy.name) {
    throw new Error(`${String((rawAttempt as { name?: unknown }).name)} is not eligible for offline replay.`);
  }
  const attempt = attemptSchema.parse(rawAttempt);
  if (attempt.name !== fermentationReadingOfflinePolicy.name || !fermentationReadingOfflinePolicy.offlineReplay) {
    throw new Error(`${attempt.name} is not eligible for offline replay.`);
  }
  migrateLegacyOutbox(storage);
  if (isRetired(storage, attempt.id)) throw new Error("Outbox request identity was already retired.");
  const existing = storedAttempt(storage, attempt.id);
  if (existing && !sameImmutableAttempt(existing, attempt)) throw new Error("Outbox request identity was already used.");
  if (!existing) writeAttempt(storage, attempt);
}

export function visibleOutbox(entries: OutboxAttempt[], scope: Pick<OfflineScope, "actorId" | "breweryId">) {
  return entries.filter((entry) => entry.scope.actorId === scope.actorId && entry.scope.breweryId === scope.breweryId);
}

function replaceAttempt(storage: OutboxStorage, replacement: OutboxAttempt | null, id: string) {
  const current = storedAttempt(storage, id);
  if (!current) return;
  if (replacement) {
    const parsed = attemptSchema.parse(replacement);
    if (!sameImmutableAttempt(current, parsed)) throw new Error("Outbox request identity changed.");
    writeAttempt(storage, parsed);
  } else retireAttempt(storage, id);
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "The reading response could not be confirmed.";
}

async function sendOne(storage: OutboxStorage, id: string, scope: OfflineScope, send: OutboxTransport): Promise<OutboxSendResult> {
  const entry = readOutbox(storage).find((candidate) => candidate.id === id);
  if (!entry || entry.scope.actorId !== scope.actorId || entry.scope.breweryId !== scope.breweryId) return { status: "not_current" };
  if (!fermentationReadingOfflinePolicy.roles.includes(scope.role as "admin" | "brewer")) {
    const denied = { ...entry, state: "permission_changed" as const, lastError: `Your role changed from ${entry.scope.role}; this reading will not be sent.` };
    replaceAttempt(storage, denied, id);
    return { status: "permission_changed", entry: denied };
  }
  if (entry.state === "fix" || entry.state === "permission_changed") return { status: entry.state, entry };

  const previouslyUncertain = entry.hadUncertainOutcome;
  const sending = { ...entry, attempts: entry.attempts + 1, state: "uncertain" as const, hadUncertainOutcome: true, lastError: undefined };
  // The exact attempt becomes uncertain before fetch starts. If this write
  // fails, transport does not start; if the tab dies after it, reload retries
  // the same identity and observation.
  replaceAttempt(storage, sending, id);
  try {
    await send(entry.scope.breweryId, entry.name, entry.input, entry.requestId, {
      actorId: entry.scope.actorId, breweryId: entry.scope.breweryId,
    });
    replaceAttempt(storage, null, id);
    return { status: "sent" };
  } catch (error) {
    const status = error instanceof CommandResponseError ? error.status : null;
    const code = error instanceof CommandResponseError ? error.code : undefined;
    const firstPermanent = status !== null && canRetireCommandFailure(status, false, code) && !previouslyUncertain;
    const failed = {
      ...sending,
      state: firstPermanent ? "fix" as const : "uncertain" as const,
      hadUncertainOutcome: !firstPermanent,
      lastError: failureMessage(error),
    };
    replaceAttempt(storage, failed, id);
    return { status: failed.state, entry: failed };
  }
}

export function sendOutboxAttempt(storage: OutboxStorage, id: string, scope: OfflineScope, send: OutboxTransport) {
  let active = sends.get(storage as object);
  if (!active) { active = new Map(); sends.set(storage as object, active); }
  const existing = active.get(id);
  if (existing) return existing;
  const pending = sendOne(storage, id, scope, send).finally(() => active!.delete(id));
  active.set(id, pending);
  return pending;
}

export async function flushOutbox(storage: OutboxStorage, scope: OfflineScope, send: OutboxTransport) {
  const entries = visibleOutbox(readOutbox(storage), scope).filter((entry) => entry.state === "queued" || entry.state === "uncertain");
  return Promise.all(entries.map((entry) => sendOutboxAttempt(storage, entry.id, scope, send)));
}

export function outboxDiscardConfirmation(entries: OutboxAttempt[]) {
  return `Discard ${entries.length} queued write${entries.length === 1 ? "" : "s"}?\n${entries.map((entry) => entry.label).join("\n")}`;
}

export function discardOutbox(storage: OutboxStorage, scope: OfflineScope, ids: string[], confirmation: string) {
  const selected = visibleOutbox(readOutbox(storage), scope).filter((entry) => ids.includes(entry.id));
  const expected = outboxDiscardConfirmation(selected);
  if (selected.length === 0 || confirmation !== expected) throw new Error("Named discard confirmation is required.");
  for (const entry of selected) retireAttempt(storage, entry.id);
}

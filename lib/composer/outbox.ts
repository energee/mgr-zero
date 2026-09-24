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
export const OUTBOX_RETIREMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Raw legacy entries that failed validation or collided with a stored request
 * identity during migration. They are kept (never sent) so one bad entry cannot
 * crash every staff page or hide its valid siblings (#463).
 */
export const OUTBOX_QUARANTINE_KEY = "mgr-offline-outbox:quarantine";

const staffRole = z.enum(["admin", "sales", "warehouse", "brewer", "taproom"]);
const scopeSchema = z.object({ actorId: z.string().uuid(), breweryId: z.string().uuid(), role: staffRole }).strict();
const retirementSchema = z.object({ retiredAt: z.number().int().nonnegative() }).strict();
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

const sends = new WeakMap<object, Map<string, { startedAt: number; pending: Promise<OutboxSendResult> }>>();

/**
 * Splits the legacy array into valid attempts and the raw text of everything
 * else. Unparseable JSON or a non-array quarantines the whole value; otherwise
 * each element is judged alone, so valid siblings survive (#463).
 */
function parseOutbox(raw: string): { entries: OutboxAttempt[]; rejected: string[] } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { entries: [], rejected: [raw] }; }
  if (!Array.isArray(value)) return { entries: [], rejected: [raw] };
  const entries: OutboxAttempt[] = [];
  const rejected: string[] = [];
  for (const element of value) {
    const parsed = attemptSchema.safeParse(element);
    if (parsed.success) entries.push(parsed.data);
    else rejected.push(JSON.stringify(element));
  }
  return { entries, rejected };
}

function quarantine(storage: OutboxStorage, rejected: string[]) {
  if (rejected.length === 0) return;
  let existing: string[] = [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(OUTBOX_QUARANTINE_KEY) ?? "[]");
    if (Array.isArray(parsed)) existing = parsed.filter((item): item is string => typeof item === "string");
  } catch { /* a damaged quarantine is replaced, not fatal */ }
  try { storage.setItem(OUTBOX_QUARANTINE_KEY, JSON.stringify([...existing, ...rejected])); }
  catch { throw new Error("Could not update the offline outbox. The saved requests were retained."); }
}

/** Staff-facing notice for entries set aside by migration, or null when none. */
export function outboxQuarantineNotice(storage: OutboxStorage): string | null {
  let count = 0;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(OUTBOX_QUARANTINE_KEY) ?? "[]");
    count = Array.isArray(parsed) ? parsed.length : 1;
  } catch { count = 1; }
  if (count === 0) return null;
  return `${count} unreadable offline reading${count === 1 ? " was" : "s were"} set aside and not sent. Re-enter ${count === 1 ? "it" : "them"} if still needed.`;
}

/** Drops the quarantined raw entries once staff have seen the notice. */
export function dismissOutboxQuarantine(storage: OutboxStorage) {
  storage.removeItem(OUTBOX_QUARANTINE_KEY);
  notifyOutboxChange();
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

function pruneRetired(storage: OutboxStorage, now = Date.now()) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (!key?.startsWith(OUTBOX_RETIRED_PREFIX)) continue;
    const id = key.slice(OUTBOX_RETIRED_PREFIX.length);
    const raw = storage.getItem(key);
    let retiredAt: number;
    try {
      retiredAt = raw === "retired" ? now : retirementSchema.parse(JSON.parse(raw ?? "")).retiredAt;
      if (raw === "retired") storage.setItem(key, JSON.stringify({ retiredAt }));
    } catch { continue; }
    if (now - retiredAt < OUTBOX_RETIREMENT_MAX_AGE_MS) continue;
    const active = sends.get(storage as object)?.get(id);
    if (active && now - active.startedAt < OUTBOX_RETIREMENT_MAX_AGE_MS) continue;
    // Never remove the guard while a physical row could still be exposed.
    try { storage.removeItem(entryKey(id)); } catch { continue; }
    if (storage.getItem(entryKey(id)) !== null) continue;
    try { storage.removeItem(key); } catch { /* retaining a marker is safe */ }
  }
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
  try { storage.setItem(retiredKey(id), JSON.stringify({ retiredAt: Date.now() })); }
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
  const { entries, rejected } = parseOutbox(raw);
  for (const entry of entries) {
    if (isRetired(storage, entry.id)) continue;
    let current: OutboxAttempt | null;
    try { current = storedAttempt(storage, entry.id); } catch { rejected.push(JSON.stringify(entry)); continue; }
    // A reused identity (duplicate or conflicting row) is set aside, never sent.
    if (current && !sameImmutableAttempt(current, entry)) { rejected.push(JSON.stringify(entry)); continue; }
    if (!current) writeAttempt(storage, entry);
  }
  quarantine(storage, rejected);
  try { storage.removeItem(OUTBOX_STORAGE_KEY); notifyOutboxChange(); }
  catch { throw new Error("Could not update the offline outbox. The saved requests were retained."); }
}

export function readOutbox(storage: OutboxStorage): OutboxAttempt[] {
  migrateLegacyOutbox(storage);
  pruneRetired(storage);
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

export function readOutboxAttempt(storage: OutboxStorage, id: string) {
  migrateLegacyOutbox(storage);
  pruneRetired(storage);
  return storedAttempt(storage, id);
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

function replaceAttempt(storage: OutboxStorage, replacement: OutboxAttempt | null, id: string, startedAt?: number) {
  const current = storedAttempt(storage, id);
  if (!current) return;
  if (replacement) {
    // An expired marker may be pruned only after this generation is old
    // enough that its late result can no longer mutate durable state.
    if (startedAt !== undefined && Date.now() - startedAt >= OUTBOX_RETIREMENT_MAX_AGE_MS) return;
    const parsed = attemptSchema.parse(replacement);
    if (!sameImmutableAttempt(current, parsed)) throw new Error("Outbox request identity changed.");
    writeAttempt(storage, parsed);
  } else retireAttempt(storage, id);
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "The reading response could not be confirmed.";
}

async function sendOne(storage: OutboxStorage, id: string, scope: OfflineScope, send: OutboxTransport, startedAt: number): Promise<OutboxSendResult> {
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
    replaceAttempt(storage, failed, id, startedAt);
    return { status: failed.state, entry: failed };
  }
}

export function sendOutboxAttempt(storage: OutboxStorage, id: string, scope: OfflineScope, send: OutboxTransport) {
  let active = sends.get(storage as object);
  if (!active) { active = new Map(); sends.set(storage as object, active); }
  const existing = active.get(id);
  if (existing) return existing.pending;
  const startedAt = Date.now();
  const pending = sendOne(storage, id, scope, send, startedAt).finally(() => active!.delete(id));
  active.set(id, { startedAt, pending });
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

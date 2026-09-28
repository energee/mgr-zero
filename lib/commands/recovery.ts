import { z } from "zod";
import type { CommandContextExpectation } from "./registry";

const attemptSchema = z.object({
  target: z.string().optional(),
  // A screen that shows its own recovery (the import wizard) marks its saved
  // requests: the shared panel skips them, and `data` is whatever that screen
  // needs to redraw the request, validated by the screen itself.
  owner: z.object({ id: z.string(), data: z.unknown() }).optional(),
  requestId: z.string(), name: z.string(), input: z.unknown(), path: z.string(),
  expectedContext: z.object({ actorId: z.string(), breweryId: z.string().optional(), customerId: z.string().optional() }),
});
export type RecoveryAttempt = z.infer<typeof attemptSchema>;
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const RECOVERY_CHANGED = "mgr-command-recovery-changed";
function scopeKey(context: CommandContextExpectation) {
  return `mgr-command-recovery-v1:${JSON.stringify([context.actorId, context.breweryId, context.customerId])}`;
}
export function readRecoveries(storage: RecoveryStorage, context: CommandContextExpectation): RecoveryAttempt[] {
  const raw = storage.getItem(scopeKey(context));
  if (!raw) return [];
  const attempts = z.array(attemptSchema).parse(JSON.parse(raw));
  if (attempts.some(attempt => scopeKey(attempt.expectedContext) !== scopeKey(context))) throw new Error("Saved request context does not match this account.");
  return attempts;
}
function save(storage: RecoveryStorage, context: CommandContextExpectation, attempts: RecoveryAttempt[], notify = true) {
  if (attempts.length) storage.setItem(scopeKey(context), JSON.stringify(attempts));
  else storage.removeItem(scopeKey(context));
  if (notify && typeof window !== "undefined") window.dispatchEvent(new Event(RECOVERY_CHANGED));
}
/**
 * Which saved request a submit belongs to: the command plus the row it acts on.
 * Only a caller that runs one command against several existing rows (a price
 * cell, an invoice push, a menu item, a delete) passes `target`; ids inside a
 * create's input are choices, not the record, so without a target the lock
 * stays per command and a changed submit cannot become a duplicate.
 */
export function recoveryKey(name: string, target?: string) {
  return JSON.stringify([name, target ?? null]);
}
/** Request ids this tab is sending right now: their outcome is still coming, so the panel neither shows nor discards them. */
export const inFlightRequests = new Set<string>();
/**
 * Save before sending: a reload during fetch is also an unknown outcome.
 * A saved attempt for the same key is resumed, unless the caller names a
 * different `requestId`: only callers that manage exact identity do, and they
 * do it to start a deliberate new attempt, which replaces the saved one.
 * `resumed` says the attempt was already saved, so its first send may have
 * applied and a later rejection must not clear it.
 */
export function beginRecovery(storage: RecoveryStorage, context: CommandContextExpectation, path: string, name: string, input: unknown, { requestId, target, owner }: { requestId?: string; target?: string; owner?: RecoveryAttempt["owner"] } = {}): { attempt: RecoveryAttempt; resumed: boolean } {
  const attempts = readRecoveries(storage, context);
  const previous = attempts.find(attempt => recoveryKey(attempt.name, attempt.target) === recoveryKey(name, target));
  if (previous && (!requestId || requestId === previous.requestId)) {
    if (JSON.stringify(previous.input) !== JSON.stringify(input)) throw new Error("An earlier request may have completed. Use Retry saved request before submitting changes.");
    return { attempt: previous, resumed: true };
  }
  const attempt = attemptSchema.parse(JSON.parse(JSON.stringify({ requestId: requestId ?? crypto.randomUUID(), name, input, path, expectedContext: context, target, owner })));
  save(storage, context, [...attempts.filter(item => item !== previous), attempt], false);
  return { attempt, resumed: false };
}
/** Removes a saved request: after its outcome is known, or when the user discards it having checked the result. */
export function finishRecovery(storage: RecoveryStorage, attempt: RecoveryAttempt) {
  save(storage, attempt.expectedContext, readRecoveries(storage, attempt.expectedContext).filter(item => item.requestId !== attempt.requestId));
}
/**
 * The user checked the result and drops a saved request; nothing is sent.
 * Refuses one still being sent, since a changed resubmit could then apply
 * twice. Returns false when nothing was saved under that id.
 */
export function discardRecovery(storage: RecoveryStorage, context: CommandContextExpectation, requestId: string) {
  if (inFlightRequests.has(requestId)) throw new Error("This request is still being sent. Wait for its outcome.");
  const attempt = readRecoveries(storage, context).find(row => row.requestId === requestId);
  if (attempt) finishRecovery(storage, attempt);
  return Boolean(attempt);
}

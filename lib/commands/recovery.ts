import { z } from "zod";
import type { CommandContextExpectation } from "./registry";

const attemptSchema = z.object({
  previewRows: z.array(z.number().int().positive()).optional(), target: z.string().optional(),
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
/** Save before sending: a reload during fetch is also an unknown outcome. */
export function beginRecovery(storage: RecoveryStorage, context: CommandContextExpectation, path: string, name: string, input: unknown, { requestId = crypto.randomUUID(), previewRows, target }: { requestId?: string; previewRows?: number[]; target?: string } = {}): RecoveryAttempt {
  const attempts = readRecoveries(storage, context);
  const previous = attempts.find(attempt => recoveryKey(attempt.name, attempt.target) === recoveryKey(name, target));
  if (previous) {
    if (JSON.stringify(previous.input) !== JSON.stringify(input)) throw new Error("An earlier request may have completed. Use Retry saved request before submitting changes.");
    return previous;
  }
  const attempt = attemptSchema.parse(JSON.parse(JSON.stringify({ requestId, name, input, path, expectedContext: context, previewRows, target })));
  save(storage, context, [...attempts, attempt], false);
  return attempt;
}
/** Removes a saved request: after its outcome is known, or when the user discards it having checked the result. */
export function finishRecovery(storage: RecoveryStorage, attempt: RecoveryAttempt) {
  save(storage, attempt.expectedContext, readRecoveries(storage, attempt.expectedContext).filter(item => item.requestId !== attempt.requestId));
}

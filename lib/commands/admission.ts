// lib/commands/admission.ts — the per-user request admission check shared by the
// HTTP entry points (/api/command and /api/chat). One budget per signed-in user,
// enforced by the `consume_command_admission` RPC; callers shape the 429 response.
import { CommandError, type Ctx } from "@/lib/commands/registry";

export type AdmissionDecision = { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Spends one unit of the caller's admission budget. Returns `allowed: false`
 * with a whole-second `retryAfter` (at least 1) when the budget is spent.
 * Throws a 503 `admission_unavailable` CommandError when the RPC fails or
 * returns an invalid decision, so the route fails closed.
 */
export async function consumeAdmission(db: Ctx["db"]): Promise<AdmissionDecision> {
  const { data: admission, error: admissionError } = await db.rpc("consume_command_admission");
  if (admissionError) {
    console.error(`command admission error ${admissionError.code ?? "unknown"}:`, admissionError.message);
    throw new CommandError("command admission unavailable", 503, "admission_unavailable");
  }
  const decision = (Array.isArray(admission) ? admission[0] : admission) as { allowed?: unknown; retry_after?: unknown } | null;
  if (!decision || typeof decision.allowed !== "boolean"
    || typeof decision.retry_after !== "number" || !Number.isFinite(decision.retry_after) || decision.retry_after < 0) {
    console.error("command admission returned an invalid decision");
    throw new CommandError("command admission unavailable", 503, "admission_unavailable");
  }
  return decision.allowed ? { allowed: true } : { allowed: false, retryAfter: Math.max(1, Math.ceil(decision.retry_after)) };
}

"use client";
import { useEffect, useState } from "react";
import { useCommandContext } from "@/lib/brewery-provider";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { discardRecovery, inFlightRequests, readRecoveries, RECOVERY_CHANGED, type RecoveryAttempt } from "@/lib/commands/recovery";
import { CommandRecoveryView } from "./views/command-recovery";

export function CommandRecovery() {
  const context = useCommandContext();
  const [rows, setRows] = useState<RecoveryAttempt[]>([]);
  const { busy, error, setError, run } = useCommandAction();
  useEffect(() => {
    const refresh = () => {
      try { setRows(readRecoveries(sessionStorage, context).filter(row => !row.owner && !inFlightRequests.has(row.requestId))); setError(null); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Saved requests could not be read."); }
    };
    refresh(); window.addEventListener(RECOVERY_CHANGED, refresh);
    return () => window.removeEventListener(RECOVERY_CHANGED, refresh);
  }, [context, setError]);
  async function retry(requestId: string) {
    // Re-read scoped storage: a stale rendered row is never authority to replay,
    // and run would otherwise save and send it as a new request.
    let attempt: RecoveryAttempt | undefined;
    try { attempt = readRecoveries(sessionStorage, context).find(row => row.requestId === requestId); }
    catch (cause) { return setError(cause instanceof Error ? cause.message : "Saved requests could not be read."); }
    if (!attempt) return setError("This request is no longer pending in this account.");
    // run resumes the saved attempt (same key and request id) and clears it on
    // success. The original form's callback may be gone, so reload to drop its
    // stale field state too.
    await run(attempt.name, attempt.input, () => location.reload(), { requestId: attempt.requestId, target: attempt.target, refresh: false });
  }
  // Discard only after the user has checked the result: nothing is sent, and
  // the same record accepts a new submit again.
  function discard(requestId: string) {
    setError(null);
    try {
      if (!discardRecovery(sessionStorage, context, requestId)) setError("This request is no longer pending in this account.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The saved request could not be discarded."); }
  }
  return <CommandRecoveryView rows={rows} busy={busy} error={error} onRetry={retry} onDiscard={discard} />;
}

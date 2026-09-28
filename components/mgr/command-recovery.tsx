"use client";
import { useEffect, useState } from "react";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import { command } from "@/lib/commands/client";
import { finishRecovery, readRecoveries, RECOVERY_CHANGED, type RecoveryAttempt } from "@/lib/commands/recovery";
import { CommandRecoveryView } from "./views/command-recovery";

export function CommandRecovery() {
  const context = useCommandContext();
  const [rows, setRows] = useState<RecoveryAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try { setRows(readRecoveries(sessionStorage, context).filter(row => row.name !== "import_csv")); setError(null); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Saved requests could not be read."); }
    };
    refresh(); window.addEventListener(RECOVERY_CHANGED, refresh);
    return () => window.removeEventListener(RECOVERY_CHANGED, refresh);
  }, [context]);
  async function retry(requestId: string) {
    setBusy(true); setError(null);
    try {
      // Re-read scoped storage: a stale rendered row is never authority to replay.
      const attempt = readRecoveries(sessionStorage, context).find(row => row.requestId === requestId);
      if (!attempt) throw new Error("This request is no longer pending in this account.");
      await command(context.breweryId ?? "", attempt.name, attempt.input, attempt.requestId, context);
      finishRecovery(sessionStorage, attempt);
      // The original form's callback may be gone. Drop its stale field state too.
      location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recovery failed. Retry the saved request."); }
    finally { setBusy(false); }
  }
  // Discard only after the user has checked the result: nothing is sent, and
  // the same record accepts a new submit again.
  function discard(requestId: string) {
    setError(null);
    try {
      const attempt = readRecoveries(sessionStorage, context).find(row => row.requestId === requestId);
      if (!attempt) throw new Error("This request is no longer pending in this account.");
      finishRecovery(sessionStorage, attempt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The saved request could not be discarded."); }
  }
  return <CommandRecoveryView rows={rows.filter(row => row.expectedContext.actorId === context.actorId && row.expectedContext.breweryId === context.breweryId && row.expectedContext.customerId === context.customerId)} busy={busy} error={error} onRetry={retry} onDiscard={discard} />;
}

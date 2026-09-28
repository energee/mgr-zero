"use client";
import { useState } from "react";
import { sentenceCase } from "@/lib/mgr/labels";
import { E } from "@/components/mgr/e";

/** Saved requests whose outcome is unknown: Retry replays one; Discard, after a confirming step, stops offering it. */
export function CommandRecoveryView({ rows, busy, error, onRetry, onDiscard }: {
  rows: { requestId: string; name: string; input: unknown; path: string }[];
  busy?: boolean; error?: string | null; onRetry?: (requestId: string) => void; onDiscard?: (requestId: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!rows.length && !error) return null;
  return <section aria-label="Unresolved requests" className="space-y-3 rounded-xl border p-4">
    {E.note("An earlier request may have completed. Retry its saved input before submitting changes to that record. Recovery stays in this browser tab across reloads; nothing is sent automatically.")}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {rows.map(row => <div key={row.requestId} className="space-y-2">
      <p>{sentenceCase(row.name.replace(/^upsert_/, "save_"))} · {row.path}</p>
      <details><summary>Saved request</summary><dl className="space-y-1 text-sm">{Object.entries(row.input && typeof row.input === "object" ? row.input : { input: row.input }).map(([key, value]) => <div key={key}>
        <dt className="font-medium">{sentenceCase(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}</dt>
        <dd className="whitespace-pre-wrap break-words">{typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}</dd>
      </div>)}</dl></details>
      {confirming === row.requestId ? <>
        {E.note("MGR will stop offering this retry and will not send it. Check the result first: open the record and confirm whether the change was saved.")}
        {E.btn("Confirm discard", busy ? "del disabled" : "del", undefined, () => { setConfirming(null); onDiscard?.(row.requestId); })}
        {E.btn("Keep saved request", "g", undefined, () => setConfirming(null))}
      </> : <>
        {E.btn("Retry saved request", busy ? "p disabled" : "p", undefined, () => onRetry?.(row.requestId))}
        {E.btn("Discard saved request", busy ? "g disabled" : "g", undefined, () => setConfirming(row.requestId))}
      </>}
    </div>)}
  </section>;
}

"use client";
import { useState } from "react";
import { sentenceCase } from "@/lib/mgr/labels";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";

/** Discard saved request, then a confirming step that shows `note`; `retry` sits beside Discard until then. */
export function ConfirmDiscard({ note, busy, onDiscard, retry }: { note: string; busy?: boolean; onDiscard: () => void; retry?: React.ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? <>
    {E.note(note)}
    {E.btn("Confirm discard", busy ? "del disabled" : "del", undefined, () => { setConfirming(false); onDiscard(); })}
    {E.btn("Keep saved request", "g", undefined, () => setConfirming(false))}
  </> : <>
    {retry}
    {E.btn("Discard saved request", busy ? "g disabled" : "g", undefined, () => setConfirming(true))}
  </>;
}

/** Saved requests whose outcome is unknown: Retry replays one; Discard, after a confirming step, stops offering it. */
export function CommandRecoveryView({ rows, busy, error, onRetry, onDiscard }: {
  rows: { requestId: string; name: string; input: unknown; path: string }[];
  busy?: boolean; error?: string | null; onRetry?: (requestId: string) => void; onDiscard?: (requestId: string) => void;
}) {
  if (!rows.length && !error) return null;
  return <section aria-label="Unresolved requests" className="space-y-3 rounded-xl border p-4">
    {E.note("An earlier request may have completed. Retry or discard it before submitting that action again. Recovery stays in this browser tab across reloads; nothing is sent automatically.")}
    <CommandFormMessage error={error} />
    {rows.map(row => <div key={row.requestId} className="space-y-2">
      <p>{sentenceCase(row.name.replace(/^upsert_/, "save_"))} · {row.path}</p>
      <details><summary>Saved request</summary><dl className="space-y-1 text-sm">{Object.entries(row.input && typeof row.input === "object" ? row.input : { input: row.input }).map(([key, value]) => <div key={key}>
        <dt className="font-medium">{sentenceCase(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}</dt>
        <dd className="whitespace-pre-wrap break-words">{typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}</dd>
      </div>)}</dl></details>
      <ConfirmDiscard busy={busy} onDiscard={() => onDiscard?.(row.requestId)}
        note="MGR will stop offering this retry and will not send it. Check the result first: open the record and confirm whether the change was saved."
        retry={E.btn("Retry saved request", busy ? "p disabled" : "p", undefined, () => onRetry?.(row.requestId))} />
    </div>)}
  </section>;
}

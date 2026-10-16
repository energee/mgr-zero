"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import type { ReportingBasisCorrection } from "@/lib/commands/compliance";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { FieldGroup } from "@/components/ui/field";

export function ReportingBasisView({ basis, history, timeZone, busy = false, error = null, locked = false, onCorrect, onRetry }: {
  basis: string | null;
  history: ReportingBasisCorrection[];
  timeZone: string;
  busy?: boolean;
  error?: string | null;
  locked?: boolean;
  onCorrect?: (values: { booksOpenedOn: string | null; expectedBooksOpenedOn: string | null; reason: string }) => void;
  onRetry?: () => void;
}) {
  const id = useId();
  const [date, setDate] = useState(basis ?? "");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`} className="font-heading text-xl font-semibold">Correct reporting basis</h2>
    <p className="my-3 text-sm text-muted-foreground">Admin only · after filing. Original filed snapshots remain unchanged. Every filed period affected by this change will need an amended report filed outside MGR.</p>
    {E.fld("Current books opened on", basis ? formatDate(basis) : "Not set · all history counts")}
    <form className="my-4" onSubmit={event => {
      event.preventDefault();
      onCorrect?.({ booksOpenedOn: date || null, expectedBooksOpenedOn: basis, reason: reason.trim() });
    }}>
      <FieldGroup>
        {E.edit("Corrected books opened on", date, "date", undefined, { id: `${id}-date`, onChange: setDate, disabled: busy || locked })}
        <Button type="button" variant="outline" disabled={busy || locked || !date} onClick={() => setDate("")}>Clear date · count all history</Button>
        {E.edit("Correction reason", reason, "text", undefined, { id: `${id}-reason`, onChange: setReason, required: true, disabled: busy || locked })}
        {E.row("I understand affected filed periods need amendment outside MGR", "", E.sw(confirmed, "Confirm amendment responsibility", setConfirmed, busy || locked))}
        {error && <CommandFormMessage error={error} />}
        {locked ? <Button type="button" disabled={busy || !onRetry} onClick={onRetry}>{busy ? "Saving…" : "Retry unchanged correction"}</Button>
          : <Button type="submit" className="h-auto whitespace-normal py-2" disabled={busy || !confirmed || !reason.trim() || (date || null) === basis}>{busy ? "Saving…" : "Record correction and flag amendments"}</Button>}
      </FieldGroup>
    </form>
    {E.ttl("Reporting basis history")}
    {history.length ? history.map(row => <div key={row.id} className="mt-3 rounded-lg border p-3 text-sm">
      <p className="font-medium">{row.old_basis ? formatDate(row.old_basis) : "Not set"} → {row.new_basis ? formatDate(row.new_basis) : "Not set"}</p>
      <p>{row.reason}</p>
      <p className="break-words text-muted-foreground"><time dateTime={row.corrected_at}>{formatDateTime(row.corrected_at, timeZone)}</time> · Actor {row.corrected_by}</p>
    </div>) : E.info("No reporting basis corrections recorded.")}
  </section>;
}

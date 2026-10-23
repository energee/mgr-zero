// app/(app)/compliance/[period]/file-button.tsx — step 3's FileSnapshotForm
// bound to file_compliance_report, confirmed first. Withheld beside `reason`
// (the adapter's fileReason) until the report balances.
"use client";

import { useState } from "react";
import { FileSnapshotForm } from "@/components/mgr/views/file-snapshot";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function FileButton({ jurisdiction, periodStart, periodEnd, reason }: { jurisdiction: string; periodStart: string; periodEnd: string; reason: string | null }) {
  const { busy, error, run } = useCommandAction();
  const [note, setNote] = useState("");
  return <FileSnapshotForm note={note} onNote={setNote} reason={reason} busy={busy} error={error}
    onFile={() => run("file_compliance_report", { jurisdiction, periodStart, periodEnd, note: note || undefined })} />;
}

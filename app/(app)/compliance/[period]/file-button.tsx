// app/(app)/compliance/[period]/file-button.tsx — Save filed snapshot →
// file_compliance_report, after the shared confirm sheet (FileSnapshotControl):
// a period is filed once (#760). Disabled until the generated report balances
// and every required external filing mapping is approved.
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { FileSnapshotControl } from "@/components/mgr/views/file-snapshot";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function FileButton({ jurisdiction, periodStart, periodEnd, balances, externalMappingRequired }: { jurisdiction: string; periodStart: string; periodEnd: string; balances: boolean; externalMappingRequired: string[] }) {
  const { busy, error, run } = useCommandAction();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="file-note">Note · optional</Label>
      <Input id="file-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="where and when it was filed" />
      <FileSnapshotControl busy={busy} error={error} disabled={!balances || externalMappingRequired.length > 0}
        onDelete={() => run("file_compliance_report", { jurisdiction, periodStart, periodEnd, note: note || undefined })} />
      {externalMappingRequired.includes("taproom") && <CommandFormMessage tone="warning">Save is unavailable until direct cellar Taproom volume has an approved external filing-line mapping.</CommandFormMessage>}
    </div>
  );
}

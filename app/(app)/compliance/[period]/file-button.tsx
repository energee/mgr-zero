// app/(app)/compliance/[period]/file-button.tsx — Save filed snapshot →
// file_compliance_report, confirmed first (FileSnapshotControl). Disabled
// until the report balances.
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { FileSnapshotControl } from "@/components/mgr/views/file-snapshot";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function FileButton({ jurisdiction, periodStart, periodEnd, balances }: { jurisdiction: string; periodStart: string; periodEnd: string; balances: boolean }) {
  const { busy, error, run } = useCommandAction();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="file-note">Note · optional</Label>
      <Input id="file-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="where and when it was filed" />
      <FileSnapshotControl busy={busy} error={error} disabled={!balances}
        onDelete={() => run("file_compliance_report", { jurisdiction, periodStart, periodEnd, note: note || undefined })} />
      {/* Stays after the confirm sheet closes: a failed filing must not vanish. */}
      <CommandFormMessage error={error} />
    </div>
  );
}

// app/(app)/compliance/[month]/file-button.tsx — Save filed snapshot →
// file_compliance_report. Disabled until the generated report balances and
// every required external filing mapping is approved.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function FileButton({ jurisdiction, periodStart, periodEnd, balances, externalMappingRequired }: { jurisdiction: string; periodStart: string; periodEnd: string; balances: boolean; externalMappingRequired: string[] }) {
  const { busy, error, run } = useCommandAction();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="file-note">Note · optional</Label>
      <Input id="file-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="where and when it was filed" />
      <Button className="w-full md:w-fit" disabled={busy || !balances || externalMappingRequired.length > 0} onClick={() => run("file_compliance_report", { jurisdiction, periodStart, periodEnd, note: note || undefined })}>Save filed snapshot</Button>
      {externalMappingRequired.includes("taproom") && <CommandFormMessage tone="warning">Save is unavailable until direct cellar Taproom volume has an approved external filing-line mapping.</CommandFormMessage>}
      <CommandFormMessage error={error} />
    </div>
  );
}

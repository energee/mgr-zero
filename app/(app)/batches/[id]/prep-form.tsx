// app/(app)/batches/[id]/prep-form.tsx — binds the shared Prep view
// (BrewPrepView) to save_batch_pulls for a planned batch. Done pulling saves the
// lots, amounts and planned vessel as a draft (no stock moves), then opens the
// Brew day tab, which starts from those pulls. Print pull list prints the page
// the way the order Pick sheet does (window.print; globals.css hides the shell).
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { BrewPrepView } from "@/components/mgr/views/brew-prep";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { brewPullsPayload, canSavePrep, type BrewPrepViewModel } from "@/lib/mgr/brew-prep-view";

export function PrepForm({ batchId, model, tabHrefs }: { batchId: string; model: BrewPrepViewModel; tabHrefs: { Prep: string; "Brew day": string } }) {
  const router = useRouter();
  const [values, setValues] = useState(model);
  const { busy, error, run } = useCommandAction();
  const ready = canSavePrep(values);
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (busy || !ready) return;
    void run("save_batch_pulls", { batchId, ...brewPullsPayload(values) }, () => router.push(tabHrefs["Brew day"]));
  }}>
    <BrewPrepView model={values} tabHrefs={tabHrefs} submitting={busy} disabled={!ready}
      onChange={patch => setValues(current => ({ ...current, ...patch }))}
      onPrint={() => window.print()} messages={<CommandFormMessage error={error} />} />
  </form>;
}

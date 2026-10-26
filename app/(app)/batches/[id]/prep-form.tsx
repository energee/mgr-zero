// app/(app)/batches/[id]/prep-form.tsx — binds the shared Prep view
// (BrewPrepView) to save_batch_pulls for a planned batch. Done pulling saves the
// lots, amounts and planned vessel as a draft (no stock moves), then opens the
// Brew day tab, which starts from those pulls. Print pull list prints the page
// the way the order Pick sheet does (window.print; globals.css hides the shell).
"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { BrewPrepView } from "@/components/mgr/views/brew-prep";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { brewPullsPayload, type BrewPrepViewModel } from "@/lib/mgr/brew-prep-view";

export function PrepForm({ batchId, model, planActions, tabHrefs }: { batchId: string; model: BrewPrepViewModel; planActions?: ReactNode; tabHrefs: { Prep: string; "Brew day": string } }) {
  const router = useRouter();
  const [values, setValues] = useState(model);
  const { busy, error, run } = useCommandAction();
  return <BrewPrepView model={values} tabHrefs={tabHrefs} planActions={planActions} submitting={busy}
    onChange={patch => setValues(current => ({ ...current, ...patch }))}
    onSave={() => { void run("save_batch_pulls", { batchId, ...brewPullsPayload(values) }, () => router.push(tabHrefs["Brew day"])); }}
    onPrint={() => window.print()} messages={<CommandFormMessage error={error} />} />;
}

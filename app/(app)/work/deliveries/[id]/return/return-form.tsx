"use client";
import { RefusedReturnFormView, type RefusedReturnModel } from "@/components/mgr/views/refused-return";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function RefusedReturnForm({ deliveryId, model }: { deliveryId: string; model: RefusedReturnModel }) {
  const { busy, error, run } = useCommandAction();
  return <RefusedReturnFormView model={model} busy={busy} error={error}
    onSubmit={(input) => { void run("check_in_refused_return", { deliveryId, ...input }); }} />;
}

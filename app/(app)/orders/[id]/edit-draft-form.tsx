// Staff effect adapter for the shared editor; all writes reuse update_draft_order.
"use client";
import { useRouter } from "next/navigation";
import { EditDraftOrderView, type EditDraftOrderModel } from "@/components/mgr/views/edit-draft-order";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function EditDraftForm({ orderId, model }: { orderId: string; model: EditDraftOrderModel }) {
  const router = useRouter();
  const action = useCommandAction();
  return <EditDraftOrderView model={model} busy={action.busy} error={action.error}
    onSave={changes => { void action.run("update_draft_order", { orderId, ...changes }, () => {
      router.push(`/orders/${orderId}`);
    }, { target: orderId }); }} />;
}

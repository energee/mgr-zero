import type { ReactNode } from "react";
import { ConfirmDeliveryView, DeliveryOutcomeForm as SharedControls } from "@/components/mgr/views/confirm-delivery";
import { confirmDeliveryStop1 } from "@/lib/mgr/fixtures/delivery";
import type { QboInvoiceAction } from "@/lib/mgr/qbo-ui";
import type { TransferReceiveLine } from "@/lib/mgr/transfer-detail-view";

function ForwardedAction({ action }: { action: ReactNode }) {
  return <ConfirmDeliveryView model={confirmDeliveryStop1} action={action} />;
}

function ControlAdapter({ control: Control }: { control: typeof SharedControls }) {
  return <Control lines={confirmDeliveryStop1.lines} />;
}

function RenderAction({ action, render }: { action: ReactNode; render: (value: { action: ReactNode }) => ReactNode }) {
  return render({ action });
}

function ActionDataView({ actions }: {
  actions: QboInvoiceAction[] | {
    onReceive: (lines: TransferReceiveLine[]) => void;
    onCancel: (reason: string) => Promise<boolean>;
  };
}) {
  return <div>{Array.isArray(actions) ? actions.join(", ") : "Transfer actions"}</div>;
}

export default function DelegatedAction({ onReceive }: { onReceive: (lines: TransferReceiveLine[]) => Promise<boolean> }) {
  const controls = <form><ControlAdapter control={SharedControls} /></form>;
  const presentation: { actions: QboInvoiceAction[] } = { actions: ["push"] };
  return <>
    <RenderAction action={controls} render={value => <ForwardedAction action={value.action} />} />
    <ActionDataView actions={presentation.actions} />
    <ActionDataView actions={{ onReceive: lines => void onReceive(lines), onCancel: reason => Promise.resolve(reason.length > 0) }} />
  </>;
}

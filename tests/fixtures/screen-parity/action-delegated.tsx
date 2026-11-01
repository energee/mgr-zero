import type { ReactNode } from "react";
import { ConfirmDeliveryView, DeliveryOutcomeForm as SharedControls } from "@/components/mgr/views/confirm-delivery";
import { confirmDeliveryStop1 } from "@/lib/mgr/fixtures/delivery";

function ForwardedAction({ action }: { action: ReactNode }) {
  return <ConfirmDeliveryView model={confirmDeliveryStop1} action={action} />;
}

function ControlAdapter({ control: Control }: { control: typeof SharedControls }) {
  return <Control lines={confirmDeliveryStop1.lines} />;
}

function RenderAction({ action, render }: { action: ReactNode; render: (value: { action: ReactNode }) => ReactNode }) {
  return render({ action });
}

export default function DelegatedAction() {
  const controls = <form><ControlAdapter control={SharedControls} /></form>;
  return <RenderAction action={controls} render={value => <ForwardedAction action={value.action} />} />;
}

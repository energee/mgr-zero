// components/mgr/views/state-registration.tsx — shared State registration body.
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RegistryDate, RegistryInput } from "@/components/mgr/views/registry-fields";
import { registrationSubmitReason, type StateRegistrationViewModel } from "@/lib/mgr/state-registration-view";
import { UsStateField } from "@/components/mgr/us-state-field";
import { Button } from "@/components/ui/button";

type Controls = Partial<Record<"state" | "registrationNo" | "expiresOn", (value: string) => void>>;

export function StateRegistrationView({ model, controls = {}, locked = false, messages, footer, submitting = false, onCancel, stateError }: {
  model: StateRegistrationViewModel; controls?: Controls; locked?: boolean; messages?: ReactNode; footer?: ReactNode;
  submitting?: boolean; onCancel?: () => void; stateError?: string;
}) {
  const id = useId();
  return (
    <>
      {E.fld("Brand", model.brand)}
      {E.cols(
        <UsStateField value={model.state} controls={{ id: `${id}-state`, onChange: controls.state, disabled: locked, required: true, error: stateError }} />,
        <RegistryInput label="Registration number · optional" value={model.registrationNo ?? ""} onChange={controls.registrationNo} />,
      )}
      <RegistryDate label="Expires · optional" value={model.expiresOn ?? ""} onChange={controls.expiresOn} />
      {E.info("One record per brand and state: saving again replaces it.")}
      {messages}
      {footer !== undefined ? footer : E.pin(<>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>Cancel</Button>
        {E.submit("Save registration", { submitting, reason: registrationSubmitReason(model) })}
      </>)}
    </>
  );
}

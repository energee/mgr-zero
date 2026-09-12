// components/mgr/views/state-registration.tsx — shared State registration body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RegistryDate, RegistryInput } from "@/components/mgr/views/registry-fields";
import type { StateRegistrationViewModel } from "@/lib/mgr/state-registration-view";

export type { StateRegistrationViewModel };

type Controls = Partial<Record<"state" | "registrationNo" | "expiresOn", (value: string) => void>>;

export function StateRegistrationView({ model, controls = {}, locked = false, messages, footer }: {
  model: StateRegistrationViewModel; controls?: Controls; locked?: boolean; messages?: ReactNode; footer?: ReactNode;
}) {
  return (
    <>
      {E.fld("Brand", model.brand)}
      {E.cols(
        <RegistryInput key="state" label="State (two letters)" value={model.state} onChange={controls.state} disabled={locked} required />,
        <RegistryInput key="number" label="Registration number · optional" value={model.registrationNo ?? ""} onChange={controls.registrationNo} />,
      )}
      <RegistryDate label="Expires · optional" value={model.expiresOn ?? ""} onChange={controls.expiresOn} />
      {E.note("One record per brand and state: saving again replaces it.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save registration")}
    </>
  );
}

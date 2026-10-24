// components/mgr/views/license.tsx — shared License sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { US_STATE_CODES } from "@/lib/mgr/enums";
import { licenseSubmitReason, type LicenseViewModel } from "@/lib/mgr/license-view";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";

export type { LicenseViewModel };

type Controls = Partial<Record<"state" | "kind" | "licenseNo" | "expiresOn", (value: string) => void>>;

const stateOptions = US_STATE_CODES.map((state) => ({ value: state, label: state }));

export function LicenseView({ model, controls = {}, locked = false, messages, footer, submitting = false, onCancel }: {
  model: LicenseViewModel; controls?: Controls; locked?: boolean; messages?: ReactNode; footer?: ReactNode;
  submitting?: boolean; onCancel?: () => void;
}) {
  return (
    <>
      {E.cols(
        <RegistrySelect label="State" value={model.state} onChange={controls.state} disabled={locked} options={stateOptions} placeholder="Choose a state" />,
        <RegistrySelect label="Kind" value={model.kind} onChange={controls.kind} disabled={locked} options={[
          { value: "brewery", label: "Brewery" },
          { value: "supplier", label: "Supplier" },
          { value: "direct to consumer", label: "Direct to consumer" },
        ]} />,
      )}
      {E.cols(
        <RegistryInput label="License number · optional" value={model.licenseNo ?? ""} onChange={controls.licenseNo} />,
        <RegistryDate label="Expires · optional" value={model.expiresOn ?? ""} onChange={controls.expiresOn} />,
      )}
      {E.info("Kind is the license class the state uses. One record per state and kind.")}
      {messages}
      {footer !== undefined ? footer : E.pin(<>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>Cancel</Button>
        {E.submit("Save license", { submitting, reason: licenseSubmitReason(model) })}
      </>)}
    </>
  );
}

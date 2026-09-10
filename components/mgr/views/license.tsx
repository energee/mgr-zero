// components/mgr/views/license.tsx — shared License sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import type { LicenseViewModel } from "@/lib/mgr/license-view";

export type { LicenseViewModel };

type Controls = Partial<Record<"state" | "kind" | "licenseNo" | "expiresOn", (value: string) => void>>;

export function LicenseView({ model, controls = {}, locked = false, messages, footer }: {
  model: LicenseViewModel; controls?: Controls; locked?: boolean; messages?: ReactNode; footer?: ReactNode;
}) {
  return (
    <>
      {E.cols(
        <RegistryInput key="state" label="State (two letters)" value={model.state} onChange={controls.state} disabled={locked} required />,
        <RegistrySelect key="kind" label="Kind" value={model.kind} onChange={controls.kind} disabled={locked} options={[
          { value: "brewery", label: "Brewery" },
          { value: "supplier", label: "Supplier" },
          { value: "direct to consumer", label: "Direct to consumer" },
        ]} />,
      )}
      {E.cols(
        <RegistryInput key="number" label="License number · optional" value={model.licenseNo ?? ""} onChange={controls.licenseNo} />,
        <RegistryDate key="expires" label="Expires · optional" value={model.expiresOn ?? ""} onChange={controls.expiresOn} />,
      )}
      {E.note("Kind is the license class the state uses. One record per state and kind.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save license")}
    </>
  );
}

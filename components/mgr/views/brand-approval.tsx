// components/mgr/views/brand-approval.tsx — shared Brand approval sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import type { BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";

export type { BrandApprovalViewModel };

type Controls = Partial<Record<"brandId" | "kind" | "number" | "approvedOn" | "expiresOn", (value: string) => void>>;

export function BrandApprovalView({ model, controls = {}, messages, footer }: {
  model: BrandApprovalViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
}) {
  return (
    <>
      <RegistrySelect
        label="Brand"
        value={model.brandId}
        options={model.brandOptions.map(({ id, label }) => ({ value: id, label }))}
        onChange={controls.brandId}
        placeholder={model.brand}
      />
      <RegistrySelect label="Approval" value={model.kind} options={model.kindOptions} onChange={controls.kind} />
      <RegistryInput label={model.numberLabel} value={model.number ?? ""} onChange={controls.number} required />
      {E.cols(
        <RegistryDate key="approved" label="Approved on · optional" value={model.approvedOn ?? ""} onChange={controls.approvedOn} />,
        <RegistryDate key="expires" label="Expires · optional" value={model.expiresOn ?? ""} onChange={controls.expiresOn} />,
      )}
      {messages}
      {footer !== undefined ? footer : E.btn("Save approval")}
    </>
  );
}

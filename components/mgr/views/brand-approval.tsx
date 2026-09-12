// components/mgr/views/brand-approval.tsx — shared Brand approval sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import { approvalNumberLabel, type BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";

export type { BrandApprovalViewModel };

type Controls = Partial<Record<"brandId" | "kind" | "number" | "submittedOn", (value: string) => void>>;

export function BrandApprovalView({ model, controls = {}, messages, footer }: {
  model: BrandApprovalViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
}) {
  return (
    <>
      {model.brandOptions.length ? (
        <RegistrySelect
          label="Brand"
          value={model.brandId}
          options={model.brandOptions.map(({ id, label }) => ({ value: id, label }))}
          onChange={controls.brandId}
          placeholder={model.brand}
        />
      ) : (
        E.fld("Brand", model.brand)
      )}
      <RegistrySelect label="Approval" value={model.kind} options={model.kindOptions} onChange={controls.kind} />
      <RegistryInput label={approvalNumberLabel(model.kind)} value={model.number ?? ""} onChange={controls.number} required />
      <RegistryDate label="Date submitted · optional" value={model.submittedOn ?? ""} onChange={controls.submittedOn} />
      {messages}
      {footer !== undefined ? footer : E.btn("Save approval")}
    </>
  );
}

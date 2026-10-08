// components/mgr/views/brand-approval.tsx — shared Brand approval sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RegistryDate, RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import { approvalNumberLabel, colaUrl, type BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";

export type { BrandApprovalViewModel };

type Controls = Partial<Record<"kind" | "number" | "serialNumber" | "submittedOn", (value: string) => void>>;

/** Open COLA from the TTB ID, or why it is missing. Opening it does not verify the approval. */
function colaLink(ttbId: string) {
  const href = colaUrl(ttbId);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground underline">Open COLA on TTB’s public registry</a>
    : <p className="text-sm text-muted-foreground">Enter the TTB ID to open the COLA on TTB’s public registry.</p>;
}

export function BrandApprovalView({ model, controls = {}, messages, footer }: {
  model: BrandApprovalViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
}) {
  const cola = model.kind === "cola";
  return (
    <>
      {E.fld("Brand", model.brand)}
      <RegistrySelect label="Approval" value={model.kind} options={model.kindOptions} onChange={controls.kind} />
      <RegistryInput label={approvalNumberLabel(model.kind)} value={model.number ?? ""} onChange={controls.number} required />
      {cola && <>
        <RegistryInput label="Serial number · optional" value={model.serialNumber ?? ""} onChange={controls.serialNumber} />
        {colaLink(model.number ?? "")}
      </>}
      <RegistryDate label="Date submitted · optional" value={model.submittedOn ?? ""} onChange={controls.submittedOn} />
      {messages}
      {footer !== undefined ? footer : E.btn("Save approval")}
    </>
  );
}

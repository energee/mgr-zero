// components/mgr/views/brand-approval.tsx — Brand approval sheet. Live stays
// ApprovalForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BrandApprovalViewModel } from "@/lib/mgr/brand-approval-view";

export type { BrandApprovalViewModel };

export function BrandApprovalView({ model, form }: { model: BrandApprovalViewModel; form?: ReactNode }) {
  return form !== undefined ? form : (
    <>
      {E.pick("Brand", model.brand, model.brandOptions)}
      {E.pick("Approval", model.kind, model.kindOptions)}
      {E.inp(model.numberLabel)}
      {E.cols(E.edit("Approved on · optional", model.approvedOn ?? "", "date"), E.edit("Expires · optional", model.expiresOn ?? "", "date"))}
      {E.btn("Save approval")}
    </>
  );
}

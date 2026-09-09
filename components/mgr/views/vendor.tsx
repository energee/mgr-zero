// components/mgr/views/vendor.tsx — Vendor inventory sheet. Live stays VendorForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { VendorViewModel } from "@/lib/mgr/vendor-view";

export type { VendorViewModel };

export function VendorView({ model, form }: { model: VendorViewModel; form?: ReactNode }) {
  return form ?? (
    <>
      {E.edit("Vendor name", model.name)}
      {E.edit("Email", model.email, "email")}
      {E.inline(
        E.pick("Terms", model.terms, model.termsOptions),
        E.edit("Lead time (days)", model.leadDays, "number"),
      )}
      {E.info("The typed figure is what Planning dates a buy-by from. Received orders give an observed average that is read, never stored.")}
      {E.btn("Save vendor")}
    </>
  );
}

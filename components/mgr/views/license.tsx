// components/mgr/views/license.tsx — License sheet. Live stays LicenseForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { LicenseViewModel } from "@/lib/mgr/license-view";

export type { LicenseViewModel };

export function LicenseView({ model, form }: { model: LicenseViewModel; form?: ReactNode }) {
  return form !== undefined ? form : (
    <>
      {E.cols(E.edit("State (two letters)", model.state), E.edit("Kind", model.kind))}
      {E.cols(E.edit("License number · optional", model.licenseNo ?? ""), E.edit("Expires · optional", model.expiresOn ?? "", "date"))}
      {E.note("Kind is the license class the state uses: brewery, supplier, direct to consumer. One record per state and kind.")}
      {E.btn("Save license")}
    </>
  );
}

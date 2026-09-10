// components/mgr/views/state-registration.tsx — State registration sheet.
// Live stays RegistrationForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { StateRegistrationViewModel } from "@/lib/mgr/state-registration-view";

export type { StateRegistrationViewModel };

export function StateRegistrationView({ model, form }: { model: StateRegistrationViewModel; form?: ReactNode }) {
  return form !== undefined ? form : (
    <>
      {E.pick("Brand", model.brand, model.brandOptions)}
      {E.cols(E.edit("State (two letters)", model.state), E.edit("Registration number · optional", model.registrationNo ?? ""))}
      {E.edit("Expires · optional", model.expiresOn ?? "", "date")}
      {E.note("One record per brand and state: saving again replaces it.")}
      {E.btn("Save registration")}
    </>
  );
}

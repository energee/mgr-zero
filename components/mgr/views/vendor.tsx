// components/mgr/views/vendor.tsx — shared Vendor sheet body.
"use client";
import { E } from "@/components/mgr/e";
import { vendorFieldErrors, type VendorViewModel } from "@/lib/mgr/vendor-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import type { ReactNode } from "react";
import { Fragment, useId } from "react";
import { ConfirmDeleteControl } from "./confirm-delete";

export type { VendorViewModel };

export function VendorView({
  model,
  controls = {},
  validationAttempted = false,
  messages,
  footer,
  busy,
  error,
  onSetActive,
}: {
  model: VendorViewModel;
  controls?: {
    name?: (value: string) => void;
    email?: (value: string) => void;
    phone?: (value: string) => void;
    terms?: (value: string) => void;
    leadDays?: (value: string) => void;
  };
  messages?: ReactNode;
  validationAttempted?: boolean;
  footer?: ReactNode;
  busy?: boolean;
  error?: string | null;
  onSetActive?: (active: boolean) => Promise<boolean>;
}) {
  const controlled = (key: keyof typeof controls) => Boolean(controls[key]);
  const id = useId();
  const touched = useTouchedLines(validationAttempted);
  const errors = vendorFieldErrors(model);
  return (
    <>
      {E.edit("Vendor name", model.name, "text", undefined, { onChange: controlled("name") ? (nextValue: string) => controls.name?.(nextValue) : undefined, required: controlled("name") })}
      {E.edit("Email", model.email, "email", undefined, { id: `${id}-email`, onChange: controls.email, onBlur: () => touched.touch(0), error: (!controls.email || touched.shown(0)) ? errors.email : undefined })}
      {E.edit("Phone", model.phone, "tel", undefined, { onChange: controlled("phone") ? (nextValue: string) => controls.phone?.(nextValue) : undefined })}
      {E.inline(
        <Fragment key={"terms"}>{E.pick("Terms", model.terms, (model.termsOptions.map(option => (
                { value: option, label: option }
              ))), { onChange: controlled("terms") ? value => controls.terms?.(value) : undefined })}</Fragment>,
        <Fragment key={"lead"}>{E.edit("Lead time (days)", model.leadDays, "number", undefined, { id: `${id}-lead`, onChange: controls.leadDays, onBlur: () => touched.touch(1), error: (!controls.leadDays || touched.shown(1)) ? errors.leadDays : undefined, min: 0, step: 1, inputMode: "numeric" })}</Fragment>,
      )}
      {E.info("When Planning lists a material short and it resolves to this vendor, its buy-by date is the needed-by date less this lead time. Received orders show a separate observed average.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save vendor", !model.name.trim() || errors.email || errors.leadDays ? "p disabled" : "p")}
      {model.active !== null && <>
        {E.ttl("Vendor status")}
        {E.fld("Status", model.active ? "Active" : "Inactive")}
        {E.info("Vendors cannot currently be deleted. Deactivation removes this vendor from New purchase order choices. Existing materials, contracts and orders remain linked.")}
        <ConfirmDeleteControl
          title={model.active ? "Deactivate vendor" : "Reactivate vendor"}
          name={<>{model.active ? "Deactivate" : "Reactivate"} <strong>{model.name}</strong>?</>}
          warning="This also saves changes in this form. It does not delete the vendor or change its existing materials, contracts or orders. You can change the status again later."
          busy={busy}
          busyLabel="Saving…"
          error={error}
          reason={!model.name.trim() ? "Enter a vendor name." : errors.email ?? errors.leadDays}
          onDelete={onSetActive ? () => onSetActive(!model.active) : undefined}
        />
      </>}
    </>
  );
}

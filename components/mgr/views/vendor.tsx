// components/mgr/views/vendor.tsx — shared Vendor sheet body.
"use client";
import { E } from "@/components/mgr/e";
import { vendorFieldErrors, vendorReason, type VendorViewModel } from "@/lib/mgr/vendor-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import type { ReactNode } from "react";
import { Fragment, useId } from "react";
import { ConfirmDeleteControl } from "./confirm-delete";

export function VendorView({
  model,
  controls = {},
  validationAttempted = false,
  messages,
  footer,
  errors = {},
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
  errors?: Partial<Record<"name" | "email" | "phone" | "leadDays", string>>;
  busy?: boolean;
  error?: string | null;
  onSetActive?: (active: boolean) => Promise<boolean>;
}) {
  const id = useId();
  const controlled = (key: keyof typeof controls) => Boolean(controls[key]);
  const touched = useTouchedLines(validationAttempted);
  const localErrors = vendorFieldErrors(model);
  return (
    <>
      {E.edit("Vendor name", model.name, "text", undefined, { id: `${id}-name`, error: errors.name, onChange: controlled("name") ? (nextValue: string) => controls.name?.(nextValue) : undefined, required: controlled("name") })}
      {E.edit("Email", model.email, "email", undefined, { id: `${id}-email`, onChange: controls.email, onBlur: () => touched.touch(0), error: errors.email ?? ((!controls.email || touched.shown(0)) ? localErrors.email : undefined) })}
      {E.edit("Phone", model.phone, "tel", undefined, { id: `${id}-phone`, onBlur: () => touched.touch(2), error: errors.phone ?? ((!controls.phone || touched.shown(2)) ? localErrors.phone : undefined), placeholder: "(503) 555-0142", onChange: controls.phone })}
      {E.inline(
        <Fragment key={"terms"}>{E.pick("Terms", model.terms, (model.termsOptions.map(option => (
                { value: option, label: option }
              ))), { onChange: controlled("terms") ? value => controls.terms?.(value) : undefined })}</Fragment>,
        <Fragment key={"lead"}>{E.edit("Lead time (days)", model.leadDays, "number", undefined, { id: `${id}-lead`, onChange: controls.leadDays, onBlur: () => touched.touch(1), error: errors.leadDays ?? ((!controls.leadDays || touched.shown(1)) ? localErrors.leadDays : undefined), min: 0, step: 1, inputMode: "numeric" })}</Fragment>,
      )}
      {E.info("When Planning lists a material short and it resolves to this vendor, its buy-by date is the needed-by date less this lead time. Received orders show a separate observed average.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save vendor", vendorReason(model) ? "p disabled" : "p")}
      {model.active !== null && <>
        {E.ttl("Vendor status")}
        {E.fld("Status", model.active ? "Active" : "Inactive")}
        {E.info("Vendors cannot be deleted; deactivate one to drop it from new purchase orders.")}
        <ConfirmDeleteControl
          title={model.active ? "Deactivate vendor" : "Reactivate vendor"}
          name={<>{model.active ? "Deactivate" : "Reactivate"} <strong>{model.name}</strong>?</>}
          warning="This also saves changes in this form. It does not delete the vendor or change its existing materials, contracts or orders. You can change the status again later."
          busy={busy}
          busyLabel="Saving…"
          error={error}
          reason={!model.name.trim() ? "Enter a vendor name." : localErrors.email ?? localErrors.phone ?? localErrors.leadDays}
          onDelete={onSetActive ? () => onSetActive(!model.active) : undefined}
        />
      </>}
    </>
  );
}

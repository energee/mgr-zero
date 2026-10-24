// components/mgr/views/vendor.tsx — shared Vendor sheet body.
import { E } from "@/components/mgr/e";
import type { VendorViewModel } from "@/lib/mgr/vendor-view";
import type { ReactNode } from "react";
import { Fragment } from "react";
import { ConfirmDeleteControl } from "./confirm-delete";

export type { VendorViewModel };

export function VendorView({
  model,
  controls = {},
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
  footer?: ReactNode;
  busy?: boolean;
  error?: string | null;
  onSetActive?: (active: boolean) => Promise<boolean>;
}) {
  const controlled = (key: keyof typeof controls) => Boolean(controls[key]);
  return (
    <>
      {E.edit("Vendor name", model.name, "text", undefined, { onChange: controlled("name") ? (nextValue: string) => controls.name?.(nextValue) : undefined, required: controlled("name") })}
      {E.edit("Email", model.email, "email", undefined, { onChange: controlled("email") ? (nextValue: string) => controls.email?.(nextValue) : undefined })}
      {E.edit("Phone", model.phone, "tel", undefined, { onChange: controlled("phone") ? (nextValue: string) => controls.phone?.(nextValue) : undefined })}
      {E.inline(
        <Fragment key={"terms"}>{E.pick("Terms", model.terms, (model.termsOptions.map(option => (
                { value: option, label: option }
              ))), { onChange: controlled("terms") ? value => controls.terms?.(value) : undefined })}</Fragment>,
        <Fragment key={"lead"}>{E.edit("Lead time (days)", model.leadDays, "number", undefined, { onChange: controlled("leadDays") ? (nextValue: string) => controls.leadDays?.(nextValue) : undefined, min: 0, step: 1, inputMode: "numeric" })}</Fragment>,
      )}
      {E.info("When Planning lists a material short and it resolves to this vendor, its buy-by date is the needed-by date less this lead time. Received orders show a separate observed average.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save vendor")}
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
          reason={!model.name.trim() ? "Enter a vendor name." : undefined}
          onDelete={onSetActive ? () => onSetActive(!model.active) : undefined}
        />
      </>}
    </>
  );
}

// components/mgr/views/vendor.tsx — shared Vendor sheet body.
import { E } from "@/components/mgr/e";
import type { VendorViewModel } from "@/lib/mgr/vendor-view";
import type { ReactNode } from "react";
import { Fragment } from "react";

export type { VendorViewModel };

export function VendorView({
  model,
  controls = {},
  messages,
  footer,
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
      {E.info("Planning uses this lead time to calculate when to buy. Received orders show a separate observed average.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save vendor")}
    </>
  );
}

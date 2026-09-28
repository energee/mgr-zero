"use client";

import type { ComponentProps } from "react";
import { CustomerView } from "@/components/mgr/views/customer";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function CustomerDetailForm({ customerId, ...props }: ComponentProps<typeof CustomerView> & { customerId: string }) {
  const { busy, error, run } = useCommandAction();
  return <CustomerView {...props} busy={busy} error={error} onSave={values => {
    void run("upsert_customer", { ...values, id: customerId, licenseNumber: values.licenseNumber || undefined, taxTreatment: values.taxTreatment || undefined });
  }} />;
}

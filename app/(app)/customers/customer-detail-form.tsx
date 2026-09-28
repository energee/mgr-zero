// app/(app)/customers/customer-detail-form.tsx — live adapter for the shared
// CustomerView: saves its inline account and trading-term fields via upsert_customer.
"use client";

import type { ComponentProps } from "react";
import { CustomerView } from "@/components/mgr/views/customer";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { upsertCustomerInput } from "./customer-form";

export function CustomerDetailForm({ customerId, ...props }: ComponentProps<typeof CustomerView> & { customerId: string }) {
  const { busy, error, run } = useCommandAction();
  return <CustomerView {...props} busy={busy} error={error} onSave={values => { void run("upsert_customer", upsertCustomerInput(values, customerId)); }} />;
}

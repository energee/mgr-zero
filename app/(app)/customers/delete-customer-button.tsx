"use client";

import { useRouter } from "next/navigation";
import { DeleteCustomerControl } from "@/components/mgr/views/delete-customer";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DeleteCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  return <DeleteCustomerControl name={name} busy={busy} error={error}
    onDelete={() => run("delete_customer", { customerId }, () => router.replace("/customers"))} />;
}

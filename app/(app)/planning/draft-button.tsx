// app/(app)/planning/draft-button.tsx — Planning's verb: one draft PO per
// vendor the buyable gaps resolve to (draft_purchase_order_from_requirements).
// The label says how many before it commits.
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DraftButton({ materialIds, vendorCount }: { materialIds: string[]; vendorCount: number }) {
  const { busy, error, run } = useCommandAction();
  const router = useRouter();
  if (materialIds.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("draft_purchase_order_from_requirements", { materialIds }, () => router.push("/purchase-orders"))}>
        Draft {vendorCount} purchase {vendorCount === 1 ? "order" : "orders"}
      </Button>
    </div>
  );
}

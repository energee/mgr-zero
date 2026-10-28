// app/(app)/planning/draft-button.tsx — a Planning vendor group's verb: one
// draft PO for that vendor's buyable gaps (draft_purchase_order_from_requirements,
// which drafts one PO per resolved vendor; a group holds one vendor, #1516).
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DraftButton({ materialIds }: { materialIds: string[] }) {
  const { busy, error, run } = useCommandAction();
  const router = useRouter();
  if (materialIds.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("draft_purchase_order_from_requirements", { materialIds }, () => router.push("/purchase-orders"))}>
        Create purchase order
      </Button>
    </div>
  );
}

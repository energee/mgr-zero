// app/(app)/orders/[id]/restock/put-back-button.tsx — the one write on the
// Put back page: confirm_restock, then back to Today.
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function PutBackButton({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full md:w-fit"
        disabled={busy}
        onClick={() => run("confirm_restock", { orderId }, () => router.push("/"))}
      >
        {busy ? "Putting back…" : label}
      </Button>
      <CommandFormMessage error={error} />
    </div>
  );
}

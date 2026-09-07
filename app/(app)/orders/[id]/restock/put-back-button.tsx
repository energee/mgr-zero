// app/(app)/orders/[id]/restock/put-back-button.tsx — the one write on the
// Put back page: confirm_restock, then back to Today.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function PutBackButton({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  // useCommandAction's `busy` resets (its `finally`) before router.push("/")
  // finishes navigating away, which briefly re-enables the button; `done`
  // latches it disabled so a stray second click can't fire a second command.
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full md:w-fit"
        disabled={busy || done}
        onClick={() => run("confirm_restock", { orderId }, () => { setDone(true); router.push("/"); })}
      >
        {busy ? "Putting back…" : label}
      </Button>
      <CommandFormMessage error={error} />
    </div>
  );
}

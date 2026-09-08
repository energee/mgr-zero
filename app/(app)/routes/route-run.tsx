// app/(app)/routes/route-run.tsx — the departed route (screen records Driver
// route and Return route): every stop with its delivered time, Resume on the
// next open stop → Confirm delivery, and Return route → return_route once
// every stop is delivered.
"use client";

import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function ReturnRoute({ routeId, open }: { routeId: string; open: number }) {
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-2">
      <Button className="w-full md:w-fit" disabled={busy || open > 0} onClick={() => run("return_route", { routeId })}>Return route</Button>
      {open > 0 && <p className="text-xs text-muted-foreground">{open} stop{open === 1 ? "" : "s"} still open. Return once every stop is delivered.</p>}
      <CommandFormMessage error={error} />
    </div>
  );
}

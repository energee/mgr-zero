// app/(app)/kegs/pool-form.tsx — one CommandForm for create_keg_pool (no
// pool) and update_keg_pool (with pool), drawing the shared KegPoolFields.
// A leased or pay-per-fill pool names its vendor; a pay-per-fill pool needs
// its per-fill cost. Kind is fixed after creation.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { KegPoolFields } from "@/components/mgr/views/keg-fleet";
import { E } from "@/components/mgr/e";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { dollarsInput, toCents } from "@/lib/mgr/money";
import { kegPoolFieldErrors, toKegOption, type KegPoolKind, type KegPoolValue } from "@/lib/mgr/keg-fleet-view";
import { submitReason } from "@/lib/mgr/submit-reason";

export type Pool = { id: string; name: string; kind: KegPoolKind; per_fill_cents: number | null; deposit_cents: number; active: boolean };

export function PoolForm({ pool, vendors }: { pool?: Pool & { vendor_id: string | null }; vendors: { id: string; name: string }[] }) {
  const initial = (): KegPoolValue => ({
    name: pool?.name ?? "", kind: pool?.kind ?? "owned", vendorId: pool?.vendor_id ?? "",
    perFill: dollarsInput(pool?.per_fill_cents), deposit: dollarsInput(pool?.deposit_cents ?? 0), active: pool?.active ?? true,
  });
  const [value, setValue] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const errors = kegPoolFieldErrors(value);
  const reason = submitReason([
    errors.name && "a pool name", errors.vendorId && "a vendor",
    errors.perFill && "a per-fill cost of zero or more, in dollars and cents (no exponent notation)",
    errors.deposit && "a deposit of zero or more, in dollars and cents (no exponent notation)",
  ].filter((need): need is string => Boolean(need)));
  const form = useCommandForm(pool ? "update_keg_pool" : "create_keg_pool", {
    build: () => (pool
      ? { poolId: pool.id, name: value.name, vendorId: value.vendorId || undefined, perFillCents: toCents(value.perFill), depositCents: toCents(value.deposit), active: value.active }
      : { name: value.name, kind: value.kind, vendorId: value.kind === "owned" ? undefined : value.vendorId || undefined, perFillCents: toCents(value.perFill), depositCents: toCents(value.deposit) }),
    reset: () => { setValue(initial()); setAttempted(false); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={pool ? "Edit keg pool" : "Add keg pool"}
      trigger={<Button size="sm" variant={pool ? "outline" : "default"}>{pool ? "Edit" : "Add keg pool"}</Button>}>
      <form onInvalidCapture={() => setAttempted(true)} onSubmit={(event) => {
        setAttempted(true);
        if (reason) { event.preventDefault(); event.stopPropagation(); }
        else void form.submit(event);
      }} className="flex flex-col gap-4">
        <KegPoolFields value={value} vendors={vendors.map(toKegOption)} editing={Boolean(pool)} onChange={setValue} attempted={attempted} />
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          {E.submit(pool ? "Save keg pool" : "Add keg pool", { reason, submitting: form.submitting })}
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}

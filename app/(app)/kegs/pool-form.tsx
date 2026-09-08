// app/(app)/kegs/pool-form.tsx — one CommandForm for create_keg_pool (no
// pool) and update_keg_pool (with pool). Vendor is API-only until the
// vendors list ships with purchasing (Program 6).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { KEG_POOL_KINDS } from "@/lib/commands/taproom";
import { KIND_LABEL } from "./keg-labels";

type Kind = (typeof KEG_POOL_KINDS)[number];
export type Pool = { id: string; name: string; kind: Kind; per_fill_cents: number | null; deposit_cents: number; active: boolean };

const toDollars = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2));
const toCents = (s: string) => (s === "" ? undefined : Math.round(Number(s) * 100));

export function PoolForm({ pool }: { pool?: Pool }) {
  const [name, setName] = useState(pool?.name ?? "");
  const [kind, setKind] = useState<Kind>(pool?.kind ?? "owned");
  const [perFill, setPerFill] = useState(toDollars(pool?.per_fill_cents));
  const [deposit, setDeposit] = useState(toDollars(pool?.deposit_cents ?? 0));
  const [active, setActive] = useState(pool?.active ?? true);
  const reset = () => { setName(pool?.name ?? ""); setKind(pool?.kind ?? "owned"); setPerFill(toDollars(pool?.per_fill_cents)); setDeposit(toDollars(pool?.deposit_cents ?? 0)); setActive(pool?.active ?? true); };
  const form = useCommandForm(pool ? "update_keg_pool" : "create_keg_pool", {
    build: () => (pool
      ? { poolId: pool.id, name, perFillCents: toCents(perFill), depositCents: toCents(deposit), active }
      : { name, kind, perFillCents: toCents(perFill), depositCents: toCents(deposit) }),
    reset,
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={pool ? "Edit keg pool" : "Add keg pool"}
      trigger={<Button size="sm" variant={pool ? "outline" : "default"}>{pool ? "Edit" : "Add keg pool"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="pool-name">Pool name</Label>
          <Input id="pool-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {!pool && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="pool-kind">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger id="pool-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{KEG_POOL_KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="pool-per-fill">Per-fill cost ($)</Label>
          <Input id="pool-per-fill" type="number" min="0" step="0.01" value={perFill} onChange={(e) => setPerFill(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pool-deposit">Deposit per keg ($)</Label>
          <Input id="pool-deposit" type="number" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </div>
        {pool && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In service
          </label>
        )}
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !name.trim()}>{form.submitting ? "Saving…" : pool ? "Save keg pool" : "Add keg pool"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}

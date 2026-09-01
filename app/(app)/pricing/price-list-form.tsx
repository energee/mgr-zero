// app/(app)/pricing/price-list-form.tsx — dialog form for the
// upsert_price_list command. Doubles as create (no `priceList` prop) and edit
// (`priceList` prop pre-fills the name and the command input carries `id`,
// per plan decision 8).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type PriceListEditData = { id: string; name: string };

export function PriceListForm({ priceList }: { priceList?: PriceListEditData }) {
  const isEdit = !!priceList;
  const [name, setName] = useState(priceList?.name ?? "");
  const form = useCommandForm("upsert_price_list", {
    build: () => ({ ...(isEdit ? { id: priceList.id } : {}), name }),
    reset: () => setName(priceList?.name ?? ""),
  });

  return (
    <Dialog open={form.open} onOpenChange={form.setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "New Price List"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Price List" : "New Price List"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="price-list-name">Name</Label>
            <Input id="price-list-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          {form.error && <p className="text-sm text-red-600">{form.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// app/(app)/catalog/product-form.tsx — dialog form for the create_product command.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function ProductForm() {
  const [name, setName] = useState("");
  const [style, setStyle] = useState("");
  const [abv, setAbv] = useState("");
  const form = useCommandForm("create_product", {
    build: () => ({ name, style: style || undefined, abv: abv ? Number(abv) : undefined }),
    reset: () => { setName(""); setStyle(""); setAbv(""); },
  });

  return (
    <Dialog open={form.open} onOpenChange={form.setOpen}>
      <DialogTrigger asChild>
        <Button>New Product</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-name">Name</Label>
            <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-style">Style</Label>
            <Input id="product-style" value={style} onChange={(e) => setStyle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-abv">ABV</Label>
            <Input id="product-abv" type="number" step="0.01" value={abv} onChange={(e) => setAbv(e.target.value)} />
          </div>
          {form.error && <p className="text-sm text-red-600">{form.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

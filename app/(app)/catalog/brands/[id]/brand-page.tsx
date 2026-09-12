// app/(app)/catalog/brands/[id]/brand-page.tsx — binds BrandView to
// upsert_brand: controlled fields, Save brand, back to Catalog on success.
// Read-only roles get the same page with no controls and no footer.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { BrandView } from "@/components/mgr/views/brand";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toBrandViewProps, UNPRICED, type BrandSnapshot } from "@/lib/mgr/brand-view";

export type BrandRow = BrandSnapshot["brand"];

export function BrandPage({ brand, styles, priceGroups, cola, writable }: {
  brand: BrandRow | null; styles: string[]; priceGroups: { id: string; name: string }[]; cola: BrandSnapshot["cola"]; writable: boolean;
}) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  const [f, setF] = useState({
    name: brand?.name ?? "", style: brand?.styles?.name ?? "", abv: brand?.abv == null ? "" : String(brand.abv),
    description: brand?.description ?? "", category: brand?.category ?? "", priceGroupId: brand?.price_group_id ?? "", hops: brand?.hops ?? "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  // The view speaks in names; the command wants ids. Empty strings are omitted.
  const model = toBrandViewProps({
    brand: { id: brand?.id ?? "", name: f.name, abv: f.abv, description: f.description, category: f.category, hops: f.hops, price_group_id: f.priceGroupId, styles: f.style ? { name: f.style } : null, skus: brand?.skus ?? [] },
    styles, priceGroups, cola, backHref: "/catalog",
  });
  const controls = writable ? {
    name: set("name"), style: set("style"), abv: set("abv"), category: set("category"), description: set("description"), hops: set("hops"),
    priceGroup: (name: string) => set("priceGroupId")(name === UNPRICED ? "" : priceGroups.find((g) => g.name === name)?.id ?? ""),
  } : {};
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run("upsert_brand", {
      id: brand?.id, name: f.name, style: f.style || undefined, abv: f.abv ? Number(f.abv) : undefined,
      description: f.description || undefined, category: f.category || undefined, priceGroupId: f.priceGroupId || undefined, hops: f.hops || undefined,
    });
    if (ok) router.push("/catalog");
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <BrandView
        model={model}
        controls={controls}
        linkRows
        messages={writable ? <CommandFormMessage error={error} /> : E.info("Admin or Sales can edit a brand.")}
        footer={writable ? E.btn(busy ? "Saving…" : "Save brand", busy || !f.name.trim() ? "p disabled" : "p") : null}
      />
    </form>
  );
}

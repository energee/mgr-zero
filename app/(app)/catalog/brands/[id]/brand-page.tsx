// app/(app)/catalog/brands/[id]/brand-page.tsx — binds BrandView to
// upsert_brand: controlled fields, Save brand, back to Catalog on success,
// and the brand's compliance sheets (compliance-forms.tsx) on their rows.
// Read-only roles get the same page with no controls, footer, or sheets.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { BrandView } from "@/components/mgr/views/brand";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toBrandViewProps, UNPRICED, type BrandSnapshot } from "@/lib/mgr/brand-view";
import { ApprovalForm, RegistrationForm } from "./compliance-forms";

export type BrandRow = BrandSnapshot["brand"];

export function BrandPage({ brand, styles, priceGroups, compliance, writable }: {
  brand: BrandRow | null; styles: string[]; priceGroups: { id: string; name: string }[]; compliance: BrandSnapshot["compliance"]; writable: boolean;
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
    styles, priceGroups, compliance, backHref: "/catalog",
  });
  // Sheets need a saved brand; a read-only role sees rows without verbs.
  const subject = brand && writable ? { id: brand.id, name: brand.name } : null;
  const actions = Object.fromEntries([
    ...(compliance?.approvals ?? []).map((approval) => [approval.id, subject ? <ApprovalForm key={`${approval.id}-${approval.ttb_id}-${approval.approved_on}`} brand={subject} approval={approval} /> : null]),
    ...(compliance?.registrations ?? []).map((registration) => [registration.id, subject ? <RegistrationForm key={`${registration.id}-${registration.registration_no}-${registration.expires_on}`} brand={subject} registration={registration} /> : null]),
  ]);
  const addCompliance = subject
    ? <div className="flex gap-2 py-2"><ApprovalForm brand={subject} /><RegistrationForm brand={subject} /></div>
    : writable ? E.info("Save the brand first, then record its COLA and state registrations here.") : null;
  const controls = writable ? {
    name: set("name"), style: set("style"), abv: set("abv"), category: set("category"), description: set("description"), hops: set("hops"),
    priceGroup: (name: string) => set("priceGroupId")(name === UNPRICED ? "" : priceGroups.find((g) => g.name === name)?.id ?? ""),
  } : {};
  async function submit(e: React.FormEvent) {
    // The compliance sheets are forms in a dialog portal; React bubbles their
    // submit here through the tree, so only this form's own submit saves the brand.
    if (e.target !== e.currentTarget) return;
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
        actions={actions}
        addCompliance={addCompliance}
      />
    </form>
  );
}

// app/(app)/catalog/brands/[id]/brand-page.tsx — binds BrandView to
// upsert_brand: controlled fields and Save brand, which stays on the page (a
// new brand moves to its own page, where SKUs and compliance unlock), and
// the brand's compliance sheets (compliance-forms.tsx) on their rows.
// Always writable: page.tsx admits Admin and Sales only.
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { BrandView } from "@/components/mgr/views/brand";
import { CatalogCategoriesControl } from "@/components/mgr/views/catalog-categories";
import { useCommandAction, useFields } from "@/lib/commands/use-command-form";
import { toBrandViewProps, UNPRICED, type BrandSnapshot } from "@/lib/mgr/brand-view";
import { ApprovalForm, RegistrationForm } from "./compliance-forms";

export type BrandRow = BrandSnapshot["brand"];

export function BrandPage({ brand, styles, categories, priceGroups, compliance, cost }: {
  brand: BrandRow | null; styles: string[]; categories: string[]; priceGroups: BrandSnapshot["priceGroups"]; compliance: BrandSnapshot["compliance"]; cost: BrandSnapshot["cost"];
}) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  const categoryAction = useCommandAction();
  const { v: f, set } = useFields({
    name: brand?.name ?? "", alias: brand?.alias ?? "", style: brand?.styles?.name ?? "", abv: brand?.abv == null ? "" : String(brand.abv),
    description: brand?.description ?? "", category: brand?.category ?? "", priceGroupId: brand?.price_group_id ?? "", hops: brand?.hops ?? "",
  });
  // The view speaks in ids (UNPRICED for none); the command omits empty strings.
  const model = toBrandViewProps({
    brand: { id: brand?.id ?? "", name: f.name, alias: f.alias, abv: f.abv, description: f.description, category: f.category, hops: f.hops, price_group_id: f.priceGroupId, styles: f.style ? { name: f.style } : null, skus: brand?.skus ?? [], pours: brand?.pours ?? [] },
    styles, categories, priceGroups, compliance, cost, backHref: "/catalog", saved: brand ?? undefined,
  });
  // Sheets need a saved brand; BrandView hides the compliance section until there is one.
  const subject = brand ? { id: brand.id, name: brand.name } : null;
  const actions = subject
    ? Object.fromEntries([
      ...(compliance?.approvals ?? []).map((approval) => [approval.id, <ApprovalForm key={`${approval.id}-${approval.ttb_id}-${approval.approved_on}`} brand={subject} approval={approval} />] as const),
      ...(compliance?.registrations ?? []).map((registration) => [registration.id, <RegistrationForm key={`${registration.id}-${registration.registration_no}-${registration.expires_on}`} brand={subject} registration={registration} />] as const),
    ])
    : {};
  const addCompliance = subject
    ? <div className="flex gap-2 py-2"><ApprovalForm brand={subject} /><RegistrationForm brand={subject} /></div>
    : null;
  const controls = {
    name: set("name"), alias: set("alias"), style: set("style"), abv: set("abv"), category: set("category"), description: set("description"), hops: set("hops"),
    priceGroup: (id: string) => set("priceGroupId")(id === UNPRICED ? "" : id),
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run("upsert_brand", {
      id: brand?.id, name: f.name, alias: f.alias.trim() || undefined, style: f.style || undefined, abv: f.abv ? Number(f.abv) : undefined,
      description: f.description || undefined, category: f.category || undefined, priceGroupId: f.priceGroupId || undefined, hops: f.hops || undefined,
    }, (saved) => {
      toast.success("Brand saved");
      // run() refreshes, which re-reads an edited brand; a new one moves to its own page (upsert_brand returns the row).
      if (!brand) router.push(`/catalog/brands/${(saved as { id: string }).id}`);
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <BrandView
        model={model}
        controls={controls}
        categoryAction={<CatalogCategoriesControl categories={categories} busy={categoryAction.busy} error={categoryAction.error}
          onSave={(name, previousName) => categoryAction.run("save_catalog_category", { name, previousName }, () => {
            if (!previousName || f.category === previousName) set("category")(name);
          }, { target: previousName })}
          onDelete={name => categoryAction.run("delete_catalog_category", { name }, () => {
            if (f.category === name) set("category")("");
          }, { target: name })}
        />}
        linkRows
        messages={<CommandFormMessage error={error} />}
        footer={E.btn(busy ? "Saving…" : "Save brand", busy || !f.name.trim() ? "p disabled" : "p")}
        actions={actions}
        addCompliance={addCompliance}
      />
    </form>
  );
}

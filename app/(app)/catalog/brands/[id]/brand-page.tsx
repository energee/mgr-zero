// app/(app)/catalog/brands/[id]/brand-page.tsx — binds BrandView to
// upsert_brand: controlled fields and Save brand, which stays on the page (a
// new brand moves to its own page, where SKUs and compliance unlock), and
// the brand's compliance sheets (compliance-forms.tsx) on their rows.
// Sells as: each switch sends sellsAsCommand (create_sku, or update_sku's
// active flag) through reconcileBooleanChange, which shows the flip at once
// and puts it back if the command fails; a row with a SKU slots SkuEditForm.
// A role without create_sku gets disabled switches and no SKU sheet.
// The brand form is always writable: page.tsx admits Admin and Sales only.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { BrandView } from "@/components/mgr/views/brand";
import { CatalogCategoriesControl } from "@/components/mgr/views/catalog-categories";
import { useCommandAction, useFields } from "@/lib/commands/use-command-form";
import { sellsAsCommand, type SellsAsRow } from "@/lib/mgr/brand-sells-view";
import { toBrandViewProps, UNPRICED, type BrandSnapshot } from "@/lib/mgr/brand-view";
import { reconcileBooleanChange } from "@/lib/mgr/pos-view";
import type { KegPoolOption } from "@/lib/mgr/sku-view";
import { brandAbvError } from "@/lib/mgr/brand-abv";
import { SkuEditForm } from "../../sku-form";
import { ApprovalForm, RegistrationForm } from "./compliance-forms";
import { ColaImage } from "../../cola-image";

/** A list_brands SKU, with the facts SkuEditForm edits. */
type BrandSku = BrandSnapshot["brand"]["skus"][number] & { name: string; keg_pool_id: string | null; batch_share: number | string | null };
export type BrandRow = Omit<BrandSnapshot["brand"], "skus"> & { skus: BrandSku[] };
/** The Sells as reads; a format's package_type tells SkuEditForm whether it takes a keg pool. */
export type SellsReads = Omit<NonNullable<BrandSnapshot["sells"]>, "formats"> & { formats: (NonNullable<BrandSnapshot["sells"]>["formats"][number] & { package_type: string | null })[] };

export function BrandPage({ brand, styles, categories, priceGroups, compliance, cost, sells, pools, canSell, canManageFormats, canPrice }: {
  brand: BrandRow | null; styles: string[]; categories: string[]; priceGroups: BrandSnapshot["priceGroups"]; compliance: BrandSnapshot["compliance"]; cost: BrandSnapshot["cost"];
  sells?: SellsReads; pools: KegPoolOption[]; canSell: boolean; canManageFormats: boolean; canPrice: boolean;
}) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  const [validationAttempted, setValidationAttempted] = useState(false);
  const categoryAction = useCommandAction();
  const sellsAction = useCommandAction();
  // A switch's state until the refreshed SKUs arrive; new SKUs from the server replace every one.
  const [switched, setSwitched] = useState<Record<string, boolean>>({});
  const [switchedSkus, setSwitchedSkus] = useState(brand?.skus);
  if (switchedSkus !== brand?.skus) {
    setSwitchedSkus(brand?.skus);
    setSwitched({});
  }
  const { v: f, set } = useFields({
    name: brand?.name ?? "", alias: brand?.alias ?? "", style: brand?.styles?.name ?? "", abv: brand?.abv == null ? "" : String(brand.abv),
    description: brand?.description ?? "", category: brand?.category ?? "", priceGroupId: brand?.price_group_id ?? "", hops: brand?.hops ?? "",
  });
  const ready = Boolean(f.name.trim()) && !brandAbvError(f.abv);
  // The view speaks in ids (UNPRICED for none); the command omits empty strings.
  const viewModel = toBrandViewProps({
    brand: { id: brand?.id ?? "", name: f.name, alias: f.alias, abv: f.abv, description: f.description, category: f.category, hops: f.hops, price_group_id: f.priceGroupId, styles: f.style ? { name: f.style } : null, skus: brand?.skus ?? [], pours: brand?.pours ?? [] },
    styles, categories, priceGroups, compliance, cost, sells, backHref: "/catalog", saved: brand,
  });
  const model = { ...viewModel, sells: { ...viewModel.sells, packages: viewModel.sells.packages.map((row) => ({ ...row, on: switched[row.formatId] ?? row.on })) } };
  // Sheets need a saved brand; BrandView draws no compliance section until there is one.
  const subject = brand ? { id: brand.id, name: brand.name } : null;
  const actions = subject
    && Object.fromEntries([
      ...(compliance?.approvals ?? []).map((approval) => [approval.id, <ApprovalForm key={`${approval.id}-${approval.ttb_id}-${approval.approved_on}`} brand={subject} approval={approval} approvals={compliance?.approvals} />] as const),
      ...(compliance?.registrations ?? []).map((registration) => [registration.id, <RegistrationForm key={`${registration.id}-${registration.registration_no}-${registration.expires_on}`} brand={subject} registration={registration} />] as const),
    ]);
  const addCompliance = subject && <div className="flex gap-2 py-2"><ApprovalForm brand={subject} approvals={compliance?.approvals} /><RegistrationForm brand={subject} /></div>;
  function onSellsAs(row: SellsAsRow, on: boolean) {
    const save = (next: boolean) => {
      const { name, input } = sellsAsCommand(row, next, brand!.id);
      return sellsAction.run(name, input);
    };
    void reconcileBooleanChange(row.on, on, save, (value) => setSwitched((s) => ({ ...s, [row.formatId]: value })));
  }
  // BrandView draws Sells as only for a saved brand, so a row's SKU is in brand.skus.
  function skuSheet(row: SellsAsRow) {
    if (!canSell) return null;
    const sku = brand!.skus.find((s) => s.id === row.skuId)!;
    const format = sells?.formats.find((f) => f.id === row.formatId);
    return <SkuEditForm sku={sku} formatName={row.name} packageType={format?.package_type} pools={pools} />;
  }
  const controls = {
    name: set("name"), alias: set("alias"), style: set("style"), abv: set("abv"), category: set("category"), description: set("description"), hops: set("hops"),
    priceGroup: (id: string) => set("priceGroupId")(id === UNPRICED ? "" : id),
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setValidationAttempted(true);
    if (busy || !ready) return;
    await run("upsert_brand", {
      id: brand?.id, name: f.name, alias: f.alias.trim() || undefined, style: f.style || undefined, abv: f.abv ? Number(f.abv) : undefined,
      description: f.description || undefined, category: f.category || undefined, priceGroupId: f.priceGroupId || undefined, hops: f.hops || undefined,
    }, (row) => {
      toast.success("Brand saved");
      // upsert_brand returns the brands row: a new brand moves to its own page.
      if (!brand) router.push(`/catalog/brands/${(row as BrandRow).id}`);
    }, { refresh: Boolean(brand) }); // An edit re-reads in place; the push already loads a new brand's page.
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <BrandView
        model={model}
        controls={controls}
        validationAttempted={validationAttempted}
        categoryAction={<CatalogCategoriesControl categories={categories} busy={categoryAction.busy} error={categoryAction.error}
          onSave={(name, previousName) => categoryAction.run("save_catalog_category", { name, previousName }, () => {
            if (!previousName || f.category === previousName) set("category")(name);
          }, { target: previousName })}
          onDelete={name => categoryAction.run("delete_catalog_category", { name }, () => {
            if (f.category === name) set("category")("");
          }, { target: name })}
        />}
        linkRows={canPrice}
        formatAction={canManageFormats ? E.btn("Manage formats", "g", "/catalog") : null}
        pricingHref="/pricing"
        messages={<CommandFormMessage error={error} />}
        busy={busy}
        actions={actions ?? undefined}
        images={Object.fromEntries(model.compliance.flatMap(row => row.image ? [[row.key, <ColaImage key={`${row.key}:${row.image.url}`} ttbId={row.image.ttbId} url={row.image.url} label={`${model.name} · COLA ${row.image.ttbId}`} />]] : []))}
        addCompliance={addCompliance}
        onSellsAs={onSellsAs}
        sellsDetails={skuSheet}
        sellsDisabled={!canSell || sellsAction.busy}
        sellsMessages={<CommandFormMessage error={sellsAction.error} />}
      />
    </form>
  );
}

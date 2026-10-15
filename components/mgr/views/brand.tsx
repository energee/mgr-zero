// components/mgr/views/brand.tsx — Brand page body, shared by the inventory
// (fixture values, uncontrolled) and app/(app)/catalog/brands/[id] (controlled
// through `controls`, bound to upsert_brand). Two columns from 48rem, stacked
// below, as on Customer: the left is the form Save brand commits (identity,
// selling, sell sheet); the right is what saves on its own (SKUs, compliance
// sheets). The header badges carry the state a reader scrolls for: COLA
// pending (a jump link to Compliance), price group or Unpriced, category, SKU
// count. Until its first save, a new brand's right column is one note.
// Style is typed against the brewery's own styles as suggestions: an
// unmatched entry is the Add path. The recipe cost suggests a price group
// (lib/mgr/price-group-suggestion.ts); Use only fills the select, and Save
// brand is still the commit. ABV is the shared numeric stepper, bounded by
// BRAND_ABV like upsert_brand's schema.
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { RegistryInput, RegistrySelect, rowAction } from "@/components/mgr/views/registry-fields";
import { BRAND_ABV } from "@/lib/mgr/brand-abv";
import type { BrandViewModel } from "@/lib/mgr/brand-view";
import type { PriceGroupSuggestion } from "@/lib/mgr/price-group-suggestion";

export type { BrandViewModel };

export type BrandControls = Partial<Record<"name" | "alias" | "style" | "abv" | "category" | "priceGroup" | "description" | "hops", (value: string) => void>>;

const asOptions = (names: string[]) => names.map((name) => ({ value: name, label: name }));

/** Use fills the select from the live control; the inventory draws the verb. Only a banded suggestion has anything to use. */
function suggestionAction(suggestion: PriceGroupSuggestion, priceGroup?: (id: string) => void): ReactNode {
  if (suggestion.kind !== "group") return "";
  return priceGroup
    ? <Button type="button" variant="outline" size="sm" onClick={() => priceGroup(suggestion.groupId)}>Use</Button>
    : E.act("Use");
}

export function BrandView({
  model,
  controls = {},
  createAction,
  messages,
  footer,
  linkRows,
  actions = {},
  addCompliance,
  categoryAction,
}: {
  model: BrandViewModel;
  controls?: BrandControls;
  createAction?: ReactNode;
  messages?: ReactNode;
  footer?: ReactNode;
  /** Live: the SKU list row is a link. */
  linkRows?: boolean;
  /** Live: per-row Edit sheets keyed by compliance row; null suppresses the drawn verb. */
  actions?: Record<string, ReactNode>;
  /** Live: the Add approval / Add registration sheets; null hides them. */
  addCompliance?: ReactNode;
  categoryAction?: ReactNode;
}) {
  return (
    <div className="@container flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        {E.back("Catalog", model.title, createAction, model.backHref)}
        {model.badges.length ? (
          <div className="flex flex-wrap gap-1.5">
            {model.badges.map((badge) => <Fragment key={badge.key}>{E.status(badge.label, badge.tone, badge.href)}</Fragment>)}
          </div>
        ) : null}
      </header>
      <div className="grid items-start gap-6 @min-[48rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-label="Brand details" className="flex min-w-0 flex-col gap-4">
          {E.cols(
            <RegistryInput label="Brand name" value={model.name} onChange={controls.name} required />,
            // Staff-only: an informal name such as a series number. Never on the portal, Square or SKU names.
            <RegistryInput label="Alias" value={model.alias} onChange={controls.alias} placeholder="Staff only" />,
          )}
          {E.cols(
            <RegistryInput label="Style" value={model.style} onChange={controls.style} suggestions={model.styleOptions} />,
            E.edit("ABV %", model.abv, "number", undefined, { onChange: controls.abv, min: String(BRAND_ABV.min), max: String(BRAND_ABV.max), step: "0.1" }),
          )}
          <div className="flex flex-col gap-1">
            <RegistrySelect label="Category" value={model.category} options={[{ value: "", label: "Uncategorized" }, ...asOptions(model.categoryOptions)]} onChange={controls.category} />
            {categoryAction}
          </div>
          {E.ttl("Selling")}
          <RegistrySelect label="Price group" value={model.priceGroup} options={model.priceGroupOptions} onChange={controls.priceGroup} />
          {model.suggestion
            ? E.row(model.suggestion.title, model.suggestion.detail, suggestionAction(model.suggestion, controls.priceGroup), model.suggestion.kind === "unknown" ? "w" : "")
            : null}
          {E.ttl("Sell sheet")}
          <RegistryInput label="Description" value={model.description} onChange={controls.description} />
          <RegistryInput label="Hops" value={model.hops} onChange={controls.hops} />
          {messages}
          {footer !== undefined ? footer : E.btn("Save brand")}
        </section>
        <section aria-label="SKUs and compliance" className="flex min-w-0 flex-col gap-3">
          {model.isNew ? E.info("Save the brand to add SKUs and compliance.") : (
            <>
              {E.nav("SKU list", model.skuList, "", undefined, linkRows ? model.skuListHref : undefined)}
              {E.ttl("Compliance", "compliance")}
              {model.compliance.map((row) => (
                <div key={row.key}>{E.row(row.title, row.detail, rowAction(row, actions), row.warning ? "w" : "")}</div>
              ))}
              {addCompliance !== undefined ? addCompliance : E.btns([["Add approval", "g"], ["Add registration", "g"]])}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

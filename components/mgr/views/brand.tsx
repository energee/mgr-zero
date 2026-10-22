// components/mgr/views/brand.tsx — Brand page body, shared by the inventory
// (fixture values, uncontrolled) and app/(app)/catalog/brands/[id] (controlled
// through `controls`, bound to upsert_brand). Two columns from 48rem, stacked
// below, as on Customer: the left is the form Save brand commits (identity,
// selling, sell sheet); the right is what saves on its own (Sells as,
// compliance sheets). Sells as is one switch per packaged format (on means the
// brand sells it: an active SKU), then the packages inside the switched-on
// ones and the price group's pours, each with its prices; pours and prices
// are edited on the price group, which the section links to. The header
// badges carry the state a reader scrolls for: COLA pending (a jump link to Compliance), price group or Unpriced, category, SKU
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
import type { SellsAsRow } from "@/lib/mgr/brand-sells-view";
import type { BrandViewModel } from "@/lib/mgr/brand-view";
import type { PriceGroupSuggestion } from "@/lib/mgr/price-group-suggestion";

export type { BrandViewModel };

export type BrandControls = Partial<Record<"name" | "alias" | "style" | "abv" | "category" | "priceGroup" | "description" | "hops", (value: string) => void>>;

const asOptions = (names: string[]) => names.map((name) => ({ value: name, label: name }));

/** A switched-on format's SKU sheet: the live slot, or the drawn verb; a format with no SKU has nothing to open. */
function sellsDetail(row: SellsAsRow, details?: (row: SellsAsRow) => ReactNode): ReactNode {
  if (!row.skuId) return null;
  return details ? details(row) : E.act("Edit SKU");
}

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
  onSellsAs,
  sellsDetails,
  sellsDisabled = false,
  sellsMessages,
}: {
  model: BrandViewModel;
  controls?: BrandControls;
  createAction?: ReactNode;
  messages?: ReactNode;
  footer?: ReactNode;
  /** Live: Edit on price group is a link. */
  linkRows?: boolean;
  /** Live: per-row Edit sheets keyed by compliance row; null suppresses the drawn verb. */
  actions?: Record<string, ReactNode>;
  /** Live: the Add approval / Add registration sheets; null hides them. */
  addCompliance?: ReactNode;
  categoryAction?: ReactNode;
  /** Live: a Sells as switch was flipped; without it the inventory draws uncontrolled switches. */
  onSellsAs?: (row: SellsAsRow, on: boolean) => void;
  /** Live: the SKU sheet for a row that has a SKU; without it the inventory draws Edit SKU. */
  sellsDetails?: (row: SellsAsRow) => ReactNode;
  /** Live: no permission to switch, or a switch is saving. */
  sellsDisabled?: boolean;
  /** Live: a failed switch's error, under the switches. */
  sellsMessages?: ReactNode;
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
            // Staff-only: list_brands and SKU search match it, staff pickers and lists show it. Never on the portal, Square or SKU names.
            <RegistryInput id="brand-alias" label="Alias" value={model.alias} onChange={controls.alias}
              description="An informal name staff use, such as a series number. Search finds the beer by it, and staff lists show it beside the name. Buyers never see it." />,
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
        <section aria-label="Sells as and compliance" className="flex min-w-0 flex-col gap-3">
          {model.isNew ? E.info("Save the brand to add SKUs and compliance.") : (
            <>
              {E.ttl("Sells as", "sells-as")}
              {model.sells.packages.map((row) => (
                <div key={row.formatId}>{E.row(row.name, row.prices, (
                  <span className="flex items-center gap-2">
                    {sellsDetail(row, sellsDetails)}
                    {E.sw(row.on, `Sells as ${row.name}`, onSellsAs && ((on) => onSellsAs(row, on)), sellsDisabled)}
                  </span>
                ))}</div>
              ))}
              {sellsMessages}
              {model.sells.contents.map((line) => <div key={line.key}>{E.row(line.label, line.prices)}</div>)}
              {E.ttl("Pours")}
              {model.sells.pours.map((pour) => <div key={pour.key}>{E.row(pour.name, `${pour.size} · ${pour.prices}`)}</div>)}
              {E.nav("Edit on price group", "", "", undefined, linkRows ? model.sells.priceGroupHref : undefined)}
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

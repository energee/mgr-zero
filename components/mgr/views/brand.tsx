// components/mgr/views/brand.tsx — Brand page body, shared by the inventory
// (fixture values, uncontrolled) and app/(app)/catalog/brands/[id] (controlled
// through `controls`, bound to upsert_brand). Two columns from 48rem, stacked
// below, as on Customer: the left is the form Save brand commits (identity,
// selling, sell sheet); the right is what saves on its own (Sells as,
// compliance sheets and saved COLA labels). Sells as is one switch per packaged format (on means the
// brand sells it: an active SKU), then the packages inside the switched-on
// ones and the price group's pours, each with its prices; pours and prices
// are edited on the price group, which the section links to. The header
// badges carry the state a reader scrolls for: no COLA on file (a jump link to Compliance), price group or Unpriced, category, SKU
// count. Until its first save, a new brand's right column is one note.
// Style is typed against the brewery's own styles as suggestions: an
// unmatched entry is the Add path. The recipe cost suggests a price group
// (lib/mgr/price-group-suggestion.ts); Use only fills the select, and Save
// brand is still the commit. ABV is the shared numeric stepper, bounded by
// BRAND_ABV like upsert_brand's schema.
"use client";
import { Fragment, useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { RegistryInput, RegistrySelect, rowAction } from "@/components/mgr/views/registry-fields";
import { BRAND_ABV, brandAbvError } from "@/lib/mgr/brand-abv";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import type { SellsAsRow } from "@/lib/mgr/brand-sells-view";
import type { BrandViewModel } from "@/lib/mgr/brand-view";
import type { PriceGroupSuggestion } from "@/lib/mgr/price-group-suggestion";
import { submitReason } from "@/lib/mgr/submit-reason";

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
  validationAttempted = false,
  messages,
  footer,
  linkRows,
  pricingHref,
  actions = {},
  images,
  addCompliance,
  categoryAction,
  onSellsAs,
  sellsDetails,
  sellsDisabled = false,
  sellsMessages,
  formatAction,
  busy = false,
  nameError,
}: {
  model: BrandViewModel;
  controls?: BrandControls;
  createAction?: ReactNode;
  validationAttempted?: boolean;
  messages?: ReactNode;
  footer?: ReactNode;
  /** Live: true links to pricing; false hides the action for a denied role. */
  linkRows?: boolean;
  /** Brand editing and price-group setup both require Admin or Sales. */
  pricingHref?: string;
  /** Live: per-row Edit sheets keyed by compliance row; null suppresses the drawn verb. */
  actions?: Record<string, ReactNode>;
  /** Live: resolved label images keyed by their approval row. */
  images?: Record<string, ReactNode>;
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
  /** Live: permitted link to Catalog's format setup; null hides the action. */
  formatAction?: ReactNode;
  busy?: boolean;
  /** Live: the save's refusal of the name, such as a duplicate. */
  nameError?: string;
}) {
  const abvId = useId();
  const touched = useTouchedLines(!controls.abv || validationAttempted);
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
            <RegistryInput label="Brand name" value={model.name} onChange={controls.name} required id="brand-name" error={nameError} />,
            // Staff-only: list_brands and SKU search match it; Catalog notes it under the name, pickers beside it. Never on the portal, Square or SKU names.
            <div className="flex min-w-0 flex-col gap-2">
              {E.edit("Alias", model.alias, "text", undefined, { id: "brand-alias", onChange: controls.alias, "aria-describedby": "brand-alias-help" })}
              <FieldDescription id="brand-alias-help">An informal name staff use, such as a series number. Search finds it; buyers never see it.</FieldDescription>
            </div>,
          )}
          {E.cols(
            <RegistryInput label="Style" value={model.style} onChange={controls.style} suggestions={model.styleOptions} />,
            E.edit("ABV %", model.abv, "number", undefined, { id: abvId, onChange: controls.abv, onBlur: () => touched.touch(0), error: touched.shown(0) ? brandAbvError(model.abv) : undefined, min: BRAND_ABV.min, max: BRAND_ABV.max, step: "any" }),
          )}
          <div className="flex flex-col gap-1">
            <RegistrySelect label="Category" value={model.category} options={[{ value: "", label: "Uncategorized" }, ...asOptions(model.categoryOptions)]} onChange={controls.category} />
            {categoryAction}
          </div>
          {E.ttl("Selling")}
          <RegistrySelect label="Price group" value={model.priceGroup} options={model.priceGroupOptions} onChange={controls.priceGroup} />
          <FieldDescription>{model.priceGroupOptions.length === 1 && <>No price groups yet. </>}{E.link("Manage price groups", "Price groups", pricingHref)}. Leave No price group to keep this brand unpriced.</FieldDescription>
          {model.suggestion
            ? E.row(model.suggestion.title, model.suggestion.detail, suggestionAction(model.suggestion, controls.priceGroup), model.suggestion.kind === "unknown" ? "w" : "")
            : null}
          {E.ttl("Sell sheet")}
          <RegistryInput label="Description" value={model.description} onChange={controls.description} />
          <RegistryInput label="Hops" value={model.hops} onChange={controls.hops} />
          {messages}
          {footer !== undefined ? footer : E.submit("Save brand", { submitting: busy, reason: brandAbvError(model.abv) ?? submitReason(model.name.trim() ? [] : ["a brand name"]), className: "w-full md:w-fit md:self-end" })}
          {!model.isNew && E.info("Brands cannot be deleted or archived; to stop selling a format, switch it off under Sells as.")}
        </section>
        <section aria-label="Sells as and compliance" className="flex min-w-0 flex-col gap-3">
          {model.isNew ? E.info("Save the brand to add SKUs and compliance.") : (
            <>
              {E.ttl("Sells as", "sells-as")}
              {model.sells.packages.length
                ? E.info("Switch on a packaged format to create a SKU for this brand. A format alone is not a SKU.")
                : E.info("Add a packaged format in Catalog, then return here and switch it on to create this brand’s SKU.")}
              {formatAction !== undefined ? formatAction : E.btn("Manage formats", "g")}
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
              {model.sells.pours.length === 0 && E.info(model.sells.unpriced
                ? "Choose a price group and save the brand before adding pours or setting prices."
                : "No pours on this price group. Add a pour on Price groups; pours are servings, not SKUs.")}
              {!model.sells.unpriced && linkRows !== false && E.nav("Edit on price group", "", "", undefined, linkRows ? model.sells.priceGroupHref : undefined)}
              {E.ttl("Compliance", "compliance")}
              {model.compliance.map((row) => (
                <div key={row.key}>
                  {E.row(row.title, row.detail, rowAction(row, actions), row.warning ? "w" : "")}
                  {row.image && images?.[row.key] && <div className="py-2">{images[row.key]}</div>}
                </div>
              ))}
              {addCompliance !== undefined ? addCompliance : E.btns([["Add approval", "g"], ["Add registration", "g"]])}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

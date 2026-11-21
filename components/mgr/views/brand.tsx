// components/mgr/views/brand.tsx — Brand page body, shared by the inventory
// (fixture values, uncontrolled) and app/(app)/catalog/brands/[id] (controlled
// through `controls`, bound to upsert_brand). Two columns from 48rem, stacked
// below, as on Customer: the left is the form Save brand commits (identity,
// then style, ABV, category and price group on one row, then the sell sheet);
// the right is what saves on its own (Sells as, compliance sheets and saved
// COLA labels, each a thumbnail that opens). Save brand is pinned under both
// columns so it stays in view. Sells as is one switch per packaged format (on means the
// brand sells it: an active SKU), then the packages inside the switched-on
// ones and the price group's pours, each with its prices; pours and prices
// are edited on the price group, which the section links to. The header
// badges carry the state a reader scrolls for: no COLA on file (a jump link to Compliance), price group or Unpriced, category, SKU
// count. Until its first save, a new brand's right column is one note.
// A switched-on SKU also offers Release (portal releases), and each of its
// open releases is a row under it with Edit and Withdraw.
// Style is typed against the brewery's own styles as suggestions: an
// unmatched entry is the Add path. The recipe cost suggests a price group
// (lib/mgr/price-group-suggestion.ts); Use only fills the select, and Save
// brand is still the commit. ABV is the shared numeric stepper, bounded by
// BRAND_ABV like upsert_brand's schema.
"use client";
import { Fragment, useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { E } from "@/components/mgr/e";
import { RegistryInput, RegistrySelect, rowAction } from "@/components/mgr/views/registry-fields";
import { BRAND_ABV, brandAbvError } from "@/lib/mgr/brand-abv";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import type { SellsAsRow } from "@/lib/mgr/brand-sells-view";
import type { BrandViewModel } from "@/lib/mgr/brand-view";
import type { PriceGroupSuggestion } from "@/lib/mgr/price-group-suggestion";
import { submitReason } from "@/lib/mgr/submit-reason";

export type BrandControls = Partial<Record<"name" | "alias" | "style" | "abv" | "category" | "priceGroup" | "description" | "hops", (value: string) => void>>;

const asOptions = (names: string[]) => names.map((name) => ({ value: name, label: name }));

/** A row's name with its facts beside it, so a format, its contents or a pour takes one line. */
function nameAndFacts(name: ReactNode, facts: ReactNode): ReactNode {
  return facts ? <span>{name}<span className="font-normal text-muted-foreground"> · {facts}</span></span> : name;
}

/** A format's SKU verbs: the live slot, or the drawn Edit SKU and, while it sells, Release; a format with no SKU has nothing to open. */
function sellsDetail(row: SellsAsRow, details?: (row: SellsAsRow) => ReactNode): ReactNode {
  if (!row.skuId) return null;
  return details ? details(row) : <>{E.act("Edit SKU")}{row.on ? E.act("Release") : null}</>;
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
  releaseActions,
  sellsDisabled = false,
  sellsMessages,
  formatAction,
  busy = false,
  nameError,
  nameBlur,
  nameNote,
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
  /** Live: the SKU sheet (and Release) for a row that has a SKU; without it the inventory draws Edit SKU and Release. */
  sellsDetails?: (row: SellsAsRow) => ReactNode;
  /** Live: Edit and Withdraw for one open release, by release id; without it the inventory draws both verbs. */
  releaseActions?: (releaseKey: string) => ReactNode;
  /** Live: no permission to switch, or a switch is saving. */
  sellsDisabled?: boolean;
  /** Live: a failed switch's error, under the switches. */
  sellsMessages?: ReactNode;
  /** Live: permitted link to Catalog's format setup; null hides the action. */
  formatAction?: ReactNode;
  busy?: boolean;
  /** Live: the save's refusal of the name, such as a duplicate. */
  nameError?: string;
  /** Leaving Brand name; the live page checks for a near-duplicate then, and draws the warning under it. */
  nameBlur?: () => void;
  nameNote?: ReactNode;
}) {
  const abvId = useId();
  const descriptionId = useId();
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
            <RegistryInput label="Brand name" value={model.name} onChange={controls.name} required id="brand-name" error={nameError} onBlur={nameBlur} note={nameNote} />,
            // Staff-only: list_brands and SKU search match it; Catalog notes it under the name, pickers beside it. Never on the portal, Square or SKU names.
            <div className="flex min-w-0 flex-col gap-2">
              {E.edit("Alias", model.alias, "text", undefined, { id: "brand-alias", onChange: controls.alias, "aria-describedby": "brand-alias-help" })}
              <FieldDescription id="brand-alias-help">An informal name, such as a series number. Search finds it; buyers see it under the brand name in the portal.</FieldDescription>
            </div>,
          )}
          {/* Four short facts share a row once the column is wide enough, two by
              two below that. Style gets the most room: its names run long. ABV
              takes its stepper's own width, which does not shrink. */}
          <div className="grid grid-cols-2 items-start gap-x-4 gap-y-3 [&>*]:min-w-0 @min-[36rem]:grid-cols-[minmax(0,3fr)_auto_minmax(0,2.5fr)_minmax(0,2.5fr)]">
            <RegistryInput label="Style" value={model.style} onChange={controls.style} suggestions={model.styleOptions} />
            {E.edit("ABV %", model.abv, "number", undefined, { id: abvId, onChange: controls.abv, onBlur: () => touched.touch(0), error: touched.shown(0) ? brandAbvError(model.abv) : undefined, min: BRAND_ABV.min, max: BRAND_ABV.max, step: "any" })}
            <div className="flex flex-col gap-1">
              <RegistrySelect label="Category" value={model.category} options={[{ value: "", label: "Uncategorized" }, ...asOptions(model.categoryOptions)]} onChange={controls.category} />
              {categoryAction}
            </div>
            <div className="flex flex-col gap-1">
              <RegistrySelect label="Price group" value={model.priceGroup} options={model.priceGroupOptions} onChange={controls.priceGroup} />
              <FieldDescription>{model.priceGroupOptions.length === 1 && <>No price groups yet. </>}{E.link("Manage price groups", "Price groups", pricingHref)}</FieldDescription>
            </div>
          </div>
          {model.suggestion && (model.suggestion.kind === "group"
            ? E.row(model.suggestion.title, model.suggestion.detail, suggestionAction(model.suggestion, controls.priceGroup))
            // Nothing to act on here, so the cost note is one quiet line under the price group it explains.
            : <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">{E.status(model.suggestion.title, model.suggestion.kind === "unknown" ? "w" : "")}{model.suggestion.detail}</p>)}
          {E.ttl("Sell sheet")}
          <div className="grid items-start gap-x-4 gap-y-3 [&>*]:min-w-0 @min-[36rem]:grid-cols-[3fr_2fr]">
            <Field>
              <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
              <Textarea id={descriptionId} aria-label="Description" {...(controls.description ? { value: model.description, onChange: (event) => controls.description?.(event.target.value) } : { defaultValue: model.description })} />
            </Field>
            <RegistryInput label="Hops" value={model.hops} onChange={controls.hops} />
          </div>
        </section>
        <section aria-label="Sells as and compliance" className="flex min-w-0 flex-col gap-3">
          {model.isNew ? E.info("Save the brand to add SKUs and compliance.") : (
            <>
              {E.ttl("Sells as", "sells-as")}
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <FieldDescription className="min-w-0 flex-1 basis-56">{model.sells.packages.length
                  ? "Switch on a packaged format to create a SKU for this brand. A format alone is not a SKU."
                  : "Add a packaged format in Catalog, then return here and switch it on to create this brand’s SKU."}</FieldDescription>
                {formatAction !== undefined ? formatAction : E.btn("Manage formats", "g")}
              </div>
              {model.sells.packages.map((row) => (
                <div key={row.formatId}>{E.row(nameAndFacts(row.name, row.prices), "", (
                  <span className="flex items-center gap-2">
                    {sellsDetail(row, sellsDetails)}
                    {E.sw(row.on, `Sells as ${row.name}`, onSellsAs && ((on) => onSellsAs(row, on)), sellsDisabled)}
                  </span>
                ))}
                {row.releases.map((release) => <Fragment key={release.key}>{E.row(release.title, release.detail,
                  releaseActions ? releaseActions(release.key) : <>{E.act("Edit")}{E.act("Withdraw")}</>)}</Fragment>)}
                </div>
              ))}
              {sellsMessages}
              {model.sells.contents.map((line) => <div key={line.key}>{E.row(nameAndFacts(line.label, line.prices))}</div>)}
              {/* Pours are the group's servings, not SKUs: listed with what the beer sells as, tagged instead of switched. */}
              {model.sells.pours.map((pour) => <div key={pour.key}>{E.row(nameAndFacts(pour.name, `${pour.size} · ${pour.prices}`), "", "Pour")}</div>)}
              {model.sells.unpriced
                ? E.info("Choose a price group and save the brand before adding pours or setting prices.")
                : <FieldDescription>
                  {model.sells.pours.length ? "Pours are servings from the tap, shared by every brand on this price group." : "No pours on this price group yet. Pours are servings from the tap, not SKUs."}
                  {linkRows !== false && <> {E.link("Edit pours", "Price groups", linkRows ? model.sells.priceGroupHref : undefined)}</>}
                </FieldDescription>}
              {E.ttl("Compliance", "compliance")}
              {model.compliance.map((row) => (
                <div key={row.key}>
                  {E.row(row.title, row.detail, rowAction(row, actions), row.warning ? "w" : "")}
                  {/* The label opens from its own thumbnail, the size of Catalog's until then. */}
                  {row.image && images?.[row.key] && (
                    <details className="group py-2">
                      <summary title="Show or hide the full label" className="w-fit cursor-pointer list-none overflow-hidden rounded-sm group-open:h-auto! group-open:w-full! has-[img]:h-12 has-[img]:w-16 [&::-webkit-details-marker]:hidden">{images[row.key]}</summary>
                    </details>
                  )}
                </div>
              ))}
              {addCompliance !== undefined ? addCompliance : E.btns([["Add approval", "g"], ["Add registration", "g"]])}
            </>
          )}
        </section>
      </div>
      {/* Still a note (#1311), in one sentence; quiet text here, because the page already ends in the Save bar. */}
      {!model.isNew && <FieldDescription role="note">Brands cannot be deleted or archived; to stop selling a format, switch it off under Sells as.</FieldDescription>}
      {/* Save stays in view under both columns: the switches and compliance
          rows above it save on their own, the fields only with this button.
          --bar is the surface the view sits on (the page, or a sheet's
          popover); the shadow paints it over the host's bottom padding, so
          no row shows under the bar. */}
      <footer data-brand-footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t bg-(--bar) py-3 shadow-[0_2rem_0_var(--bar)] [--bar:var(--background)] in-data-[slot=sheet-content]:[--bar:var(--popover)]">
        {messages}
        {footer !== undefined ? footer : E.submit("Save brand", { submitting: busy, reason: brandAbvError(model.abv) ?? submitReason(model.name.trim() ? [] : ["a brand name"]), className: "w-full md:w-fit" })}
      </footer>
    </div>
  );
}

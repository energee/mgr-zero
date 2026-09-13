// components/mgr/views/brand.tsx — Brand page body, shared by the inventory
// (fixture values, uncontrolled) and app/(app)/catalog/brands/[id] (controlled
// through `controls`, bound to upsert_brand). Style is typed against the
// brewery's own styles as suggestions: an unmatched entry is the Add path.
// Compliance is the brand's: its approvals and state registrations list here
// with their sheets; the brewery's licenses are their own page. The recipe
// cost suggests a price group (lib/mgr/price-group-suggestion.ts); Use only
// fills the select, and Save brand is still the commit.
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { RegistryInput, RegistrySelect, rowAction } from "@/components/mgr/views/registry-fields";
import type { BrandViewModel } from "@/lib/mgr/brand-view";
import type { PriceGroupSuggestion } from "@/lib/mgr/price-group-suggestion";

export type { BrandViewModel };

export type BrandControls = Partial<Record<"name" | "style" | "abv" | "category" | "priceGroup" | "description" | "hops", (value: string) => void>>;

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
}) {
  return (
    <>
      {E.back("Catalog", model.name || "New brand", createAction, model.backHref)}
      <RegistryInput label="Brand name" value={model.name} onChange={controls.name} required />
      {E.cols(
        <RegistryInput label="Style" value={model.style} onChange={controls.style} suggestions={model.styleOptions} />,
        <RegistryInput label="ABV" value={model.abv} onChange={controls.abv} />,
        <RegistrySelect label="Category" value={model.category} options={asOptions(model.categoryOptions)} onChange={controls.category} placeholder="Category" />,
        <RegistrySelect label="Price group" value={model.priceGroup} options={model.priceGroupOptions} onChange={controls.priceGroup} />,
      )}
      {model.suggestion
        ? E.row(model.suggestion.title, model.suggestion.detail, suggestionAction(model.suggestion, controls.priceGroup), model.suggestion.kind === "unknown" ? "w" : "")
        : null}
      {E.ttl("Sell sheet")}
      <RegistryInput label="Description" value={model.description} onChange={controls.description} />
      <RegistryInput label="Hops" value={model.hops} onChange={controls.hops} />
      {messages}
      {footer !== undefined ? footer : E.btn("Save brand")}
      {E.nav("SKU list", model.skuList, "", undefined, linkRows ? model.skuListHref : undefined)}
      {E.ttl("Compliance")}
      {model.compliance.map((row) => (
        <Fragment key={row.key}>
          {E.row(row.title, row.detail, rowAction(row, actions), row.warning ? "w" : "")}
        </Fragment>
      ))}
      {addCompliance !== undefined ? addCompliance : E.btns([["Add approval", "g"], ["Add registration", "g"]])}
    </>
  );
}

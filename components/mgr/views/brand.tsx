// components/mgr/views/brand.tsx — Brand page body, shared by the inventory
// (fixture values, uncontrolled) and app/(app)/catalog/brands/[id] (controlled
// through `controls`, bound to upsert_brand). Style is typed against the
// brewery's own styles as suggestions: an unmatched entry is the Add path.
// Compliance is the brand's: its approvals and state registrations list here
// with their sheets; the brewery's licenses are their own page.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import type { BrandViewModel } from "@/lib/mgr/brand-view";

export type { BrandViewModel };

export type BrandControls = Partial<Record<"name" | "style" | "abv" | "category" | "priceGroup" | "description" | "hops", (value: string) => void>>;

const asOptions = (names: string[]) => names.map((name) => ({ value: name, label: name }));

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
  const styleList = "brand-style-options";
  return (
    <>
      {E.back("Catalog", model.name || "New brand", createAction, model.backHref)}
      <RegistryInput label="Brand name" value={model.name} onChange={controls.name} required />
      {E.cols(
        <Field key="style">
          <FieldLabel>Style</FieldLabel>
          <Input
            aria-label="Style"
            list={styleList}
            value={controls.style ? model.style : undefined}
            defaultValue={controls.style ? undefined : model.style}
            onChange={(event) => controls.style?.(event.target.value)}
          />
          <datalist id={styleList}>{model.styleOptions.map((o) => <option key={o} value={o} />)}</datalist>
        </Field>,
        <Fragment key="abv"><RegistryInput label="ABV" value={model.abv} onChange={controls.abv} /></Fragment>,
        <Fragment key="category"><RegistrySelect label="Category" value={model.category} options={asOptions(model.categoryOptions)} onChange={controls.category} placeholder="Category" /></Fragment>,
        <Fragment key="price"><RegistrySelect label="Price group" value={model.priceGroup} options={asOptions(model.priceGroupOptions)} onChange={controls.priceGroup} /></Fragment>,
      )}
      {E.ttl("Sell sheet")}
      <RegistryInput label="Description" value={model.description} onChange={controls.description} />
      <RegistryInput label="Hops" value={model.hops} onChange={controls.hops} />
      {messages}
      {footer !== undefined ? footer : E.btn("Save brand")}
      {E.nav("SKU list", model.skuList, "", undefined, linkRows ? model.skuListHref : undefined)}
      {E.ttl("Compliance")}
      {model.compliance.map((row) => (
        <Fragment key={row.key}>
          {E.row(row.title, row.detail, row.key in actions ? actions[row.key] : (row.verb ? E.act(row.verb) : ""), row.warning ? "w" : "")}
        </Fragment>
      ))}
      {addCompliance !== undefined ? addCompliance : E.btns([["Add approval", "g"], ["Add registration", "g"]])}
    </>
  );
}

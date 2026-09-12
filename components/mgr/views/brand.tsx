// components/mgr/views/brand.tsx — Brand detail drawing. Inventory paints
// edits + Save. Live BrandForm stays a wrapper: E.edit is not a controlled
// CommandForm.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BrandViewModel } from "@/lib/mgr/brand-view";

export type { BrandViewModel };

export function BrandView({
  model,
  createAction,
  footer,
  linkRows,
}: {
  model: BrandViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: SKU list nav is a link. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("Catalog", model.name, createAction, model.backHref)}
      {E.edit("Brand name", model.name)}
      {E.cols(
        <Fragment key="style">{E.pick("Style", model.style, model.styleOptions)}</Fragment>,
        <Fragment key="abv">{E.edit("ABV", model.abv)}</Fragment>,
        <Fragment key="category">{E.pick("Category", model.category, model.categoryOptions)}</Fragment>,
        <Fragment key="price">{E.pick("Price group", model.priceGroup, model.priceGroupOptions)}</Fragment>,
      )}
      {E.ttl("Sell sheet")}
      {E.edit("Description", model.description)}
      {E.edit("Hops", model.hops)}
      {footer !== undefined ? footer : E.btn("Save brand")}
      {E.nav("SKU list", model.skuList, "", undefined, linkRows ? model.skuListHref : undefined)}
      {E.nav("COLA", model.cola, "", undefined, linkRows ? model.colaHref : undefined)}
    </>
  );
}

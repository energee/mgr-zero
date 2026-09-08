// components/mgr/views/sku.tsx — SKU sheet drawing (inventory). Live create
// stays sku-form.tsx: E.pick is not a controlled CommandForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SkuViewModel } from "@/lib/mgr/sku-view";

export type { SkuViewModel };

export function SkuView({
  model,
  footer,
}: {
  model: SkuViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.pick("Format", model.format, model.formatOptions)}
      {E.row("Active", "available to price and sell", E.sw(model.active, "Active"))}
      {E.edit("UPC (optional)", model.upc)}
      {E.info(model.volumeInfo)}
      {footer !== undefined ? footer : E.btn("Save SKU")}
    </>
  );
}

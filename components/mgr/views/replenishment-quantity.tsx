"use client";

import { useId } from "react";
import type { ReactElement } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { noSkus } from "@/components/mgr/views/new-transfer";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { replenishmentQuantityError } from "@/lib/replenishment-form";

export const QUANTITY_KINDS = {
  par: {
    title: "Set taproom par",
    command: "set_taproom_par",
    qtyLabel: "Par quantity",
    qtyKey: "parQty",
    help: "Par is the target stock at this taproom. Zero removes its replenishment target.",
  },
  standing: {
    title: "Set standing allocation",
    command: "set_standing_allocation",
    qtyLabel: "Reserved quantity",
    qtyKey: "qty",
    help: "Reserve stock for this taproom without creating an order. This leaves less stock to promise to other orders. Zero releases this taproom’s standing allocation.",
  },
} as const;

export type ReplenishmentQuantityViewProps = {
  kind: keyof typeof QUANTITY_KINDS;
  skus: { id: string; name: string }[];
  skuId: string;
  qty: string;
  onSku?: (id: string) => void;
  onQuantity?: (qty: string) => void;
  catalogHref?: string;
  submitted?: boolean;
  submitting?: boolean;
};

/** Both quantity sheets use the same field, correction, and precision guidance. */
export function ReplenishmentQuantityView({ kind, skus, skuId, qty, onSku, onQuantity, catalogHref, submitted = false, submitting = false }: ReplenishmentQuantityViewProps): ReactElement {
  const id = useId();
  const touched = useTouchedLines(!onQuantity || submitted);
  const spec = QUANTITY_KINDS[kind];
  return <fieldset disabled={submitting} className="flex flex-col gap-4">
    {E.pick("SKU", skuId, skus.map(sku => ({ value: sku.id, label: sku.name })), { id: `${id}-sku`, placeholder: "Select SKU", onChange: onSku, empty: noSkus(catalogHref) })}
    {E.edit(spec.qtyLabel, qty, "number", undefined, { id: `${id}-qty`, min: 0, step: "any", onChange: onQuantity, required: true, error: touched.shown(0) ? replenishmentQuantityError(qty) : undefined, onBlur: () => touched.touch(0), "aria-describedby": `${id}-precision ${id}-help` })}
    <FieldDescription id={`${id}-precision`}>Fractional quantities are allowed; stored to two decimal places.</FieldDescription>
    <FieldDescription id={`${id}-help`}>{spec.help}</FieldDescription>
  </fieldset>;
}

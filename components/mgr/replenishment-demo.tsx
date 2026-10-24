"use client";

import { cloneElement, useState, type ComponentProps, type ReactElement } from "react";
import type { ReplenishmentView } from "@/components/mgr/views/replenishment";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { QUANTITY_KINDS, ReplenishmentQuantityView, type ReplenishmentQuantityViewProps } from "@/components/mgr/views/replenishment-quantity";
import { replenishmentQuantityReason } from "@/lib/replenishment-form";

type Props = { children: ReactElement<ComponentProps<typeof ReplenishmentView>> };

function QuantityDemo({ kind, skus, values }: Pick<ReplenishmentQuantityViewProps, "kind" | "skus"> & { values: Record<string, number> }): ReactElement {
  const [open, setOpen] = useState(false);
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [qty, setQty] = useState(String(values[skus[0]?.id] ?? 0));
  const [submitted, setSubmitted] = useState(false);
  const spec = QUANTITY_KINDS[kind];
  return <CommandForm open={open} onOpenChange={next => {
    setOpen(next);
    setSkuId(skus[0]?.id ?? "");
    setQty(String(values[skus[0]?.id] ?? 0));
    setSubmitted(false);
  }} title={spec.title} previewAction trigger={<Button variant="outline" data-preview-action>{spec.title}</Button>}>
    <form data-preview-action noValidate onSubmit={event => {
      event.preventDefault();
      event.stopPropagation();
      setSubmitted(true);
      if (!replenishmentQuantityReason(skuId, qty)) setOpen(false);
    }} className="flex flex-col gap-4">
      <ReplenishmentQuantityView kind={kind} skus={skus} skuId={skuId} qty={qty} submitted={submitted}
        onSku={next => { setSkuId(next); setQty(String(values[next] ?? 0)); }} onQuantity={setQty} />
      <CommandFormFooter>{E.submit(spec.title, { reason: replenishmentQuantityReason(skuId, qty) })}</CommandFormFooter>
    </form>
  </CommandForm>;
}

export function ReplenishmentDemo({ children }: Props): ReactElement {
  const [fromLocationId, setFromLocationId] = useState(() => children.props.model.warehouses[0]?.id ?? "");
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(
    children.props.model.suggestions.map(row => [row.skuId, String(row.suggested)]),
  ));
  const skus = children.props.model.suggestions.map(row => ({ id: row.skuId, name: row.sku }));

  return cloneElement(children, {
    fromLocationId,
    qtys,
    onWarehouse: setFromLocationId,
    onQuantity: (skuId, qty) => setQtys(previous => ({ ...previous, [skuId]: qty })),
    onSubmit: event => event.preventDefault(),
    quantityActions: <>
      <QuantityDemo kind="par" skus={skus} values={Object.fromEntries(children.props.model.suggestions.map(row => [row.skuId, row.par]))} />
      <QuantityDemo kind="standing" skus={skus} values={Object.fromEntries(children.props.model.allocations.map(row => [row.skuId, row.qty]))} />
    </>,
  });
}

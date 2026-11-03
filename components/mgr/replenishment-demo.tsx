"use client";

import { cloneElement, useState, type ComponentProps, type ReactElement } from "react";
import type { ReplenishmentView } from "@/components/mgr/views/replenishment";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { QUANTITY_KINDS, ReleaseAllocationView, ReplenishmentQuantityView, type ReplenishmentQuantityViewProps } from "@/components/mgr/views/replenishment-quantity";
import { replenishmentQuantityReason } from "@/lib/replenishment-form";
import type { ReplenishmentAllocation } from "@/lib/mgr/replenishment-view";
import { toParsViewProps } from "@/lib/mgr/pars-view";
import { replenishmentShortfallFormats } from "@/lib/mgr/fixtures/replenishment";

type Props = { children: ReactElement<ComponentProps<typeof ReplenishmentView>>; initialRelease?: boolean };

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

function ReleaseDemo({ allocation, initialOpen, onRelease }: {
  allocation: ReplenishmentAllocation; initialOpen: boolean; onRelease: () => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  return <CommandForm open={open} onOpenChange={setOpen} title="Release standing allocation" previewAction
    trigger={<Button type="button" variant="destructive" size="sm" aria-label={`Release ${allocation.sku} allocation`} data-preview-action>Release</Button>}>
    <form data-preview-action className="flex flex-col gap-4" onSubmit={event => {
      event.preventDefault();
      onRelease();
      setOpen(false);
    }}>
      <ReleaseAllocationView sku={allocation.sku} qty={allocation.qty} />
    </form>
  </CommandForm>;
}

export function ReplenishmentDemo({ children, initialRelease = false }: Props): ReactElement {
  const [model, setModel] = useState(children.props.model);
  const [fromLocationId, setFromLocationId] = useState(() => children.props.model.warehouses[0]?.id ?? "");
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(
    children.props.model.suggestions.map(row => [row.skuId, String(row.suggested)]),
  ));
  const skus = model.suggestions.map(row => ({ id: row.skuId, name: row.sku }));

  function release(allocation: ReplenishmentAllocation) {
    setModel(previous => ({
      ...previous,
      allocations: previous.allocations.filter(row => row.id !== allocation.id),
      shortfalls: previous.shortfalls.flatMap(row => {
        if (row.skuId !== allocation.skuId) return [row];
        const atp = row.atp + allocation.qty;
        if (atp >= 0) return [];
        const allocated = row.allocated - allocation.qty;
        const detail = toParsViewProps({
          shortfall: { skuId: row.skuId, skuName: row.detail.title, onHand: row.onHand, allocated, atp },
          ...replenishmentShortfallFormats[row.skuId], orderAllocations: [], standing: [], par: null,
        });
        return [{
          ...row, atp, allocated,
          detail: {
            ...detail,
            atpDetail: `${detail.atpDetail} across all locations`,
            rows: row.detail.rows.filter(reservation => reservation.key !== allocation.id),
          },
        }];
      }),
    }));
  }

  return cloneElement(children, {
    model,
    releaseAction: allocation => <ReleaseDemo allocation={allocation}
      initialOpen={initialRelease && allocation.id === children.props.model.allocations[0]?.id}
      onRelease={() => release(allocation)} />,
    fromLocationId,
    qtys,
    onWarehouse: setFromLocationId,
    onQuantity: (skuId, qty) => setQtys(previous => ({ ...previous, [skuId]: qty })),
    onSubmit: event => event.preventDefault(),
    quantityActions: <>
      <QuantityDemo kind="par" skus={skus} values={Object.fromEntries(model.suggestions.map(row => [row.skuId, row.par]))} />
      <QuantityDemo kind="standing" skus={skus} values={Object.fromEntries(model.allocations.map(row => [row.skuId, row.qty]))} />
    </>,
  });
}

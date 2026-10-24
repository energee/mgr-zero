"use client";

import { useState } from "react";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { ReplenishmentView } from "@/components/mgr/views/replenishment";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { replenishmentLines, replenishReason } from "@/lib/replenishment-form";
import type { ReplenishmentViewModel } from "@/lib/mgr/replenishment-view";
import { QuantityForm, ReleaseAllocationForm } from "./quantity-form";

export function ReplenishForm({ model, skus, workHrefs }: {
  model: ReplenishmentViewModel;
  skus: { id: string; name: string }[];
  workHrefs: Record<string, string>;
}) {
  const initialQtys = () => Object.fromEntries(model.suggestions.map(s => [s.skuId, String(s.suggested)]));
  const [fromLocationId, setFromLocationId] = useState(model.warehouses[0]?.id ?? "");
  const [qtys, setQtys] = useState<Record<string, string>>(initialQtys);
  const lines = replenishmentLines(model.suggestions, qtys);
  const form = useCommandForm("create_replenishment_order", {
    build: () => ({ fromLocationId, toLocationId: model.locationId, lines }),
    reset: () => setQtys(initialQtys()),
  });
  const parValues = Object.fromEntries(model.suggestions.map(s => [s.skuId, s.par]));
  const standingValues = Object.fromEntries(model.allocations.map(a => [a.skuId, a.qty]));

  return <ReplenishmentView
    model={model}
    workHrefs={workHrefs}
    fromLocationId={fromLocationId}
    qtys={qtys}
    onWarehouse={setFromLocationId}
    onQuantity={(skuId, qty) => setQtys(prev => ({ ...prev, [skuId]: qty }))}
    onSubmit={event => {
      if (!model.canEdit) { event.preventDefault(); return; }
      void form.submit(event);
    }}
    quantityActions={model.canEdit && model.locationId ? <>
      <QuantityForm key={`par-${JSON.stringify(parValues)}`} locationId={model.locationId} skus={skus} kind="par" values={parValues} />
      <QuantityForm key={`standing-${JSON.stringify(standingValues)}`} locationId={model.locationId} skus={skus} kind="standing" values={standingValues} />
    </> : null}
    releaseAction={allocation => model.canEdit ? <ReleaseAllocationForm allocationId={allocation.id} sku={allocation.sku} qty={allocation.qty} /> : null}
    feedback={<CommandFormMessage error={form.error} />}
    submitAction={model.canEdit ? E.submit("Create replenishment order", {
      submitting: form.submitting,
      reason: replenishReason(fromLocationId, lines),
      busy: "Creating…",
      className: "w-fit",
    }) : null}
  />;
}

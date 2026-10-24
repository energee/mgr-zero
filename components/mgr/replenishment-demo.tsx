"use client";

import { cloneElement, useState, type ComponentProps, type ReactElement } from "react";
import type { ReplenishmentView } from "@/components/mgr/views/replenishment";

type Props = { children: ReactElement<ComponentProps<typeof ReplenishmentView>> };

export function ReplenishmentDemo({ children }: Props): ReactElement {
  const [fromLocationId, setFromLocationId] = useState(() => children.props.model.warehouses[0]?.id ?? "");
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(
    children.props.model.suggestions.map(row => [row.skuId, String(row.suggested)]),
  ));

  return cloneElement(children, {
    fromLocationId,
    qtys,
    onWarehouse: setFromLocationId,
    onQuantity: (skuId, qty) => setQtys(previous => ({ ...previous, [skuId]: qty })),
    onSubmit: event => event.preventDefault(),
  });
}

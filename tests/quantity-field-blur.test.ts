import { Children, createElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import type * as ReactModule from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ active: false, touched: new Set<number>() }));
vi.mock("react", async importOriginal => {
  const original = await importOriginal<typeof ReactModule>();
  return { ...original, useState: (initial: unknown) => {
    if (!harness.active) return original.useState(initial);
    return [harness.touched, (update: (previous: ReadonlySet<number>) => Set<number>) => { harness.touched = update(harness.touched); }];
  } };
});

import { ReplenishmentQuantityView } from "@/components/mgr/views/replenishment-quantity";
import { RepackView } from "@/components/mgr/views/repack";
import { toRepackView } from "@/lib/mgr/repack-view";

type Element = ReactElement<{ children?: ReactNode; onBlur?: () => void }>;
function elements(node: ReactNode): Element[] {
  if (!isValidElement<Element["props"]>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

beforeEach(() => { harness.touched = new Set(); });

it.each(["par", "standing", "repack"] as const)("marks only the %s quantity after leaving its field", kind => {
  let tree: ReactNode;
  function Harness() {
    harness.active = true;
    try {
      tree = kind === "repack"
        ? RepackView({ model: toRepackView({ parent: "Lantern Pils · case", unit: "case", qty: "-2", composition: null }), footer: null, onQuantity: () => {} })
        : ReplenishmentQuantityView({ kind, skus: [{ id: "sku", name: "Lantern Pils" }], skuId: "sku", qty: "-1", onQuantity: () => {} });
      return tree;
    } finally { harness.active = false; }
  }
  expect(renderToStaticMarkup(createElement(Harness))).not.toContain('aria-invalid="true"');
  const quantity = elements(tree!).find(element => element.props.onBlur);
  expect(quantity).toBeDefined();
  quantity!.props.onBlur!();
  expect(harness.touched).toEqual(new Set([0]));
  const markup = renderToStaticMarkup(createElement(Harness));
  expect(markup).toContain('aria-invalid="true"');
  expect(markup).toContain(kind === "repack" ? "Enter a quantity above zero." : "Enter a quantity of zero or more.");
});

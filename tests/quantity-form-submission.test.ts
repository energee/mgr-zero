import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import type * as ReactModule from "react";

const harness = vi.hoisted(() => ({ values: [] as unknown[], sent: [] as unknown[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof ReactModule>(),
  useId: () => "quantity-form",
  useEffect: vi.fn(),
  useState: (initial: unknown) => [harness.values.length ? harness.values.shift() : typeof initial === "function" ? initial() : initial, vi.fn()],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/brewery-provider", () => ({ useBrewery: () => "brewery" }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: (_name: string, opts: { build: () => unknown }) => ({
  open: true, setOpen: vi.fn(), submitting: false, error: null,
  submit: () => { harness.sent.push(opts.build()); },
  run: (_command: string, input: unknown) => { harness.sent.push(input); },
}) }));

import { QuantityForm } from "@/app/(app)/replenishment/quantity-form";
import { RepackForm } from "@/app/(app)/packaging/repack-form";

beforeEach(() => { harness.values = []; harness.sent = []; });

function submitQuantity(kind: "par" | "standing", qty: string): void {
  harness.values = ["sku", qty, []];
  const surface = QuantityForm({ locationId: "taproom", skus: [{ id: "sku", name: "Lantern Pils" }], kind, values: {} });
  surface.props.children.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
}

function submitRepack(qty: string): void {
  harness.values = ["warehouse", "bin", "parent", "", qty, [], null];
  const surface = RepackForm({ locations: [{ id: "warehouse", name: "Warehouse" }], bins: [{ id: "bin", location_id: "warehouse", name: "Cold" }], parents: [{ id: "parent", label: "Lantern Pils · case", unit: "case", bblPerUnit: 0.096774, child: { skuId: "child", unit: "four-pack", quantity: 6 } }], formatsHref: "/catalog" });
  surface.props.children.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
}

describe("quantity form submit boundaries", () => {
  it.each(["par", "standing"] as const)("never sends invalid %s quantities", kind => {
    for (const qty of ["", "-1", "invalid", "Infinity", "10000000000"]) submitQuantity(kind, qty);
    expect(harness.sent).toEqual([]);
  });

  it("sends valid fractional par and reserved quantities without rounding them", () => {
    submitQuantity("par", "2.555");
    submitQuantity("standing", "2.5");
    expect(harness.sent).toEqual([
      { locationId: "taproom", skuId: "sku", parQty: 2.555 },
      { locationId: "taproom", skuId: "sku", qty: 2.5 },
    ]);
  });

  it("never sends invalid repack quantities even when the form submits directly", () => {
    for (const qty of ["", "0", "-2", "invalid", "Infinity", "10000000000"]) submitRepack(qty);
    expect(harness.sent).toEqual([]);
  });

  it("preserves valid fractional repacks and derives the child quantity", () => {
    submitRepack("1.5");
    expect(harness.sent).toEqual([{ locationId: "warehouse", binId: "bin", parentSkuId: "parent", parentQty: 1.5, childSkuId: "child", childQty: 9, lotId: undefined }]);
  });
});

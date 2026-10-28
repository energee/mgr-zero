import { createElement, type ReactElement } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { MovementRecordedViewModel } from "@/lib/mgr/movement-recorded-view";
import { E } from "@/components/mgr/e";
import { RecordMovementView } from "@/components/mgr/views/record-movement";

const state = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], onSuccess: undefined as ((data: unknown) => void) | undefined, build: undefined as (() => unknown) | undefined }));
vi.mock("react", async original => ({
  ...await original<typeof React>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = typeof initial === "function" ? initial() : initial;
    return [state.values[index], (value: unknown) => { state.values[index] = typeof value === "function" ? value(state.values[index]) : value; }];
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/inventory", useRouter: () => ({ replace: () => undefined }), useSearchParams: () => new URLSearchParams("recordMovement=1") }));
vi.mock("@/lib/brewery-provider", () => ({ useBrewery: () => "brewery" }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: (_name: string, options: { onSuccess: (data: unknown) => void; build: () => unknown }) => {
  state.onSuccess = options.onSuccess;
  state.build = options.build;
  return { open: true, setOpen: () => {}, submit: () => {}, busy: false, error: null };
} }));
import { MovementForm } from "@/app/(app)/inventory/movement-form";
import { MovementRecordedView } from "@/components/mgr/views/movement-recorded";

afterEach(() => vi.restoreAllMocks());

it.each([false, true])("captures the lot code before reset, including a depleted prefilled lot (%s) (#1382)", depleted => {
  const id = "53e1d7c9-e862-4de1-908c-5f1134c729ab";
  state.values = [];
  const props = { initial: { skuId: "sku", locationId: "location", binId: "bin", lotId: id }, initialLot: depleted ? { id, code: "QA-TEST-LOT" } : null, skus: [{ id: "sku", label: "Pils case", bblPerUnit: 0.05 }], locations: [{ id: "location", name: "Warehouse", uses: ["warehouse"] }], bins: [{ id: "bin", location_id: "location", name: "Cold" }], channels: [], timeZone: "UTC", skusHref: null };
  const render = () => { state.cursor = 0; return MovementForm(props); };
  render();
  state.values[1] = depleted ? [] : [{ kind: "sku", stock_id: "sku", bin_id: "bin", lot_id: id, lot_code: "QA-TEST-LOT", qty: 1 }];
  render();
  state.onSuccess!({ id, created_at: "2026-09-02T12:00:00Z", sku_id: "sku", location_id: "location", bin_id: "bin", qty: depleted ? 1 : -1, bbl: depleted ? 0.05 : -0.05, type: depleted ? "adjustment" : "loss", lot_id: id, ref: null, note: null });
  state.values[1] = [];
  const dialogs = render().props.children as ReactElement<{ children: ReactElement<{ model: MovementRecordedViewModel }> }>[];
  const model = dialogs[1].props.children.props.model;
  const html = renderToStaticMarkup(createElement(MovementRecordedView, { model }));
  expect(html).toContain("QA-TEST-LOT");
  expect(html).not.toContain("Movement reference");
  expect(html).not.toContain("Source reference");
  expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
});

it("keeps colliding displayed lot labels distinct through the shared picker and submitted input (#1382)", () => {
  const availableId = "53e1d7c9-e862-4de1-908c-5f1134c729ab";
  const depletedId = "549c18d9-0123-4123-8123-123456789abc";
  const label = "LOT-A · 1 available";
  state.values = [];
  const props = {
    initial: { skuId: "sku", locationId: "location", binId: "bin", lotId: depletedId, qty: 1, type: "adjustment" as const },
    initialLot: { id: depletedId, code: label },
    skus: [{ id: "sku", label: "Pils case", bblPerUnit: 0.05 }],
    locations: [{ id: "location", name: "Warehouse", uses: ["warehouse"] }],
    bins: [{ id: "bin", location_id: "location", name: "Cold" }],
    channels: [], timeZone: "UTC", skusHref: null,
  };
  const render = () => { state.cursor = 0; return MovementForm(props); };
  render();
  state.values[1] = [{ kind: "sku", stock_id: "sku", bin_id: "bin", lot_id: availableId, lot_code: "LOT-A", qty: 1 }];
  const dialogs = render().props.children as ReactElement<{ children: ReactElement<{ children: ReactElement<Parameters<typeof RecordMovementView>[0]> }> }>[];
  const view = dialogs[0].props.children.props.children;
  const pick = vi.spyOn(E, "pick");
  renderToStaticMarkup(createElement(RecordMovementView, view.props));
  const [, selectedId, options, controls] = pick.mock.calls.find(([field]) => field === "Lot")!;
  expect(selectedId).toBe(depletedId);
  expect(options).toEqual(expect.arrayContaining([{ value: availableId, label }, { value: depletedId, label }]));
  for (const id of [depletedId, availableId, ""]) {
    controls!.onChange!(id);
    render();
    expect(state.build!()).toMatchObject({ lotId: id || undefined });
  }
});

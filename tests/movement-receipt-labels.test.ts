// tests/movement-receipt-labels.test.ts — the live Record movement form,
// rendered with React's state hooks stubbed: the saved movement's toast
// (#1382, #1507), lot labels through the shared picker, and the default bin
// a chosen SKU starts on (#1507).
import { createElement, type ReactElement } from "react";
import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { E } from "@/components/mgr/e";
import { RecordMovementView } from "@/components/mgr/views/record-movement";

const state = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], toasts: [] as [string, string | undefined][], onSuccess: undefined as ((data: unknown) => void) | undefined, build: undefined as (() => unknown) | undefined }));
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
vi.mock("sonner", () => ({ toast: { success: (title: string, options?: { description?: string }) => { state.toasts.push([title, options?.description]); } } }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: (_name: string, options: { onSuccess: (data: unknown) => void; build: () => unknown }) => {
  state.onSuccess = options.onSuccess;
  state.build = options.build;
  return { open: true, setOpen: () => {}, submit: () => {}, busy: false, error: null };
} }));
import { MovementForm } from "@/app/(app)/inventory/movement-form";

type FormProps = Parameters<typeof MovementForm>[0];
type ViewElement = ReactElement<{ children: ReactElement<{ children: ReactElement<Parameters<typeof RecordMovementView>[0]> }> }>;
/** The RecordMovementView element inside the form's CommandForm. */
const viewOf = (form: ViewElement) => form.props.children.props.children;
/** Index of the form's `stock` state (get_bin_move_stock rows): its first useState. */
const STOCK = 0;

beforeEach(() => {
  state.toasts = [];
  vi.stubGlobal("window", { location: { pathname: "/inventory", search: "?recordMovement=1", hash: "" }, history: { replaceState: () => {} } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const place = { locations: [{ id: "location", name: "Warehouse", uses: ["warehouse"] }], bins: [{ id: "bin", location_id: "location", name: "Cold" }], channels: [], onHand: [], skusHref: null };

it.each([false, true])("toasts the receipt line with the lot code captured before reset, including a depleted prefilled lot (%s) (#1382, #1507)", depleted => {
  const id = "53e1d7c9-e862-4de1-908c-5f1134c729ab";
  state.values = [];
  const props: FormProps = { ...place, initial: { skuId: "sku", locationId: "location", binId: "bin", lotId: id }, initialLot: depleted ? { id, code: "QA-TEST-LOT" } : null, skus: [{ id: "sku", label: "Pils case", bblPerUnit: 0.05 }] };
  const render = () => { state.cursor = 0; return MovementForm(props); };
  render();
  state.values[STOCK] = depleted ? [] : [{ kind: "sku", stock_id: "sku", bin_id: "bin", lot_id: id, lot_code: "QA-TEST-LOT", qty: 1 }];
  render();
  state.onSuccess!({ id, created_at: "2026-09-02T12:00:00Z", sku_id: "sku", location_id: "location", bin_id: "bin", qty: depleted ? 1 : -1, bbl: depleted ? 0.05 : -0.05, type: depleted ? "adjustment" : "loss", dest_state: null, lot_id: id, ref: null, note: null });
  expect(state.toasts).toHaveLength(1);
  const [title, line] = state.toasts[0];
  expect(title).toBe("Movement recorded");
  expect(line).toContain("Pils case");
  expect(line).toContain("Warehouse / Cold");
  expect(line).toContain("lot QA-TEST-LOT");
  expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
});

it("keeps colliding displayed lot labels distinct through the shared picker and submitted input (#1382)", () => {
  const availableId = "53e1d7c9-e862-4de1-908c-5f1134c729ab";
  const depletedId = "549c18d9-0123-4123-8123-123456789abc";
  const label = "LOT-A · 1 available";
  state.values = [];
  const props: FormProps = { ...place, initial: { skuId: "sku", locationId: "location", binId: "bin", lotId: depletedId, qty: 1, type: "adjustment" as const }, initialLot: { id: depletedId, code: label }, skus: [{ id: "sku", label: "Pils case", bblPerUnit: 0.05 }] };
  const render = () => { state.cursor = 0; return MovementForm(props) as ViewElement; };
  render();
  state.values[STOCK] = [{ kind: "sku", stock_id: "sku", bin_id: "bin", lot_id: availableId, lot_code: "LOT-A", qty: 1 }];
  const view = viewOf(render());
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

it("starts a chosen SKU on the bin holding the most of it, and a SKU with no stock keeps the picked bin (#1507)", () => {
  state.values = [];
  const props: FormProps = {
    ...place,
    locations: [{ id: "a", name: "Brewhouse", uses: ["warehouse"] }, { id: "b", name: "Cold storage", uses: ["warehouse"] }],
    bins: [{ id: "a1", location_id: "a", name: "Cold" }, { id: "b1", location_id: "b", name: "Walk-in" }, { id: "b2", location_id: "b", name: "Dry" }],
    onHand: [{ sku_id: "pils", location_id: "a", bin_id: "a1", qty: "3" }, { sku_id: "pils", location_id: "b", bin_id: "b2", qty: "40" }, { sku_id: "hazy", location_id: "a", bin_id: "a1", qty: "8" }],
    initial: { skuId: "pils", qty: 1, type: "adjustment" as const },
    skus: [{ id: "pils", label: "Pils case", bblPerUnit: 0.05 }, { id: "hazy", label: "Hazy case", bblPerUnit: 0.05 }, { id: "new", label: "New case", bblPerUnit: 0.05 }],
  };
  const render = () => { state.cursor = 0; return MovementForm(props) as ViewElement; };
  render();
  expect(state.build!()).toMatchObject({ skuId: "pils", locationId: "b", binId: "b2" });
  viewOf(render()).props.controls!.sku!("hazy");
  render();
  expect(state.build!()).toMatchObject({ skuId: "hazy", locationId: "a", binId: "a1" });
  viewOf(render()).props.controls!.sku!("new");
  render();
  expect(state.build!()).toMatchObject({ skuId: "new", locationId: "a", binId: "a1" });
});

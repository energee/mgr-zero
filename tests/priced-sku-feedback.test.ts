// Adapter wiring with an explicit eight-hook fixture, plus one rendered shared-view error case.
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, isValidElement } from "react";
const state = vi.hoisted(() => ({ queryCalls: [] as unknown[][], data: undefined as unknown, error: null as Error | null, paused: false, fetching: false, retry: vi.fn(), submit: vi.fn(), useState: vi.fn() }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(), useState: state.useState, useId: () => "test-error" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: (...args: unknown[]) => { state.queryCalls.push(args); return ({ data: state.data, error: state.error, isPaused: state.paused, isFetching: state.fetching, dataUpdatedAt: state.data ? 1000 : 0, refetch: state.retry }); } }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => ({ submit: state.submit, submitting: false }) }));
import { OrderForm } from "@/app/(app)/orders/order-form";
import { NewOrderView, OrderSkuPicker } from "@/components/mgr/views/new-order";
const customers = [{ id: "a", name: "Buyer A", sale_channel_id: "a", shipTos: [{ id: "dock", label: "Dock" }] }, { id: "b", name: "Buyer B", sale_channel_id: "b", shipTos: [{ id: "dock-b", label: "Dock B" }] }];
const skus = [{ id: "sku", label: "Fixture Beer Keg" }, { id: "other", label: "Other Keg" }];
let customer = "a";
let kind = "wholesale";
const setCustomer = (value: string) => { customer = value; };
function form() {
  // Exactly eight OrderForm state hooks; fail fast if its state contract changes.
  state.useState.mockReset();
  state.useState.mockReturnValueOnce([kind, vi.fn()]).mockReturnValueOnce([customer, setCustomer])
    .mockReturnValueOnce(["dock", vi.fn()]).mockReturnValueOnce(["source", vi.fn()])
    .mockReturnValueOnce(["", vi.fn()]).mockReturnValueOnce(["", vi.fn()]).mockReturnValueOnce(["", vi.fn()])
    .mockReturnValueOnce([[{ skuId: "sku", qty: "3" }], vi.fn()]);
  const rendered = OrderForm({ customers, locations: [{ id: "source", name: "Source", kind: "warehouse" }], skus });
  expect(state.useState).toHaveBeenCalledTimes(8);
  return rendered;
}
function view() { return form().props.children.props as Parameters<typeof NewOrderView>[0]; }
beforeEach(() => { customer = "a"; kind = "wholesale"; state.queryCalls = []; state.data = undefined; state.error = null; state.paused = false; state.fetching = false; state.retry.mockClear(); state.submit.mockClear(); });
it("distinguishes cold loading, offline, failure and genuine empty pricing", () => {
  expect(renderToStaticMarkup(view().skuFeedback)).toContain("Loading customer-priced SKUs");
  expect(view().skuOptionsReady).toBe(false);
  state.paused = true;
  expect(renderToStaticMarkup(view().skuFeedback)).toContain("Waiting for connection");
  state.paused = false; state.error = new Error("Pricing unavailable");
  const failed = view();
  expect(renderToStaticMarkup(failed.skuFeedback)).toContain("Pricing unavailable");
  expect(renderToStaticMarkup(failed.skuFeedback)).toContain("Try again");
  expect(failed.skuOptionsReady).toBe(false);
  state.error = null; state.data = [];
  expect(view().skuOptionsReady).toBe(true);
  expect(view().skuEmptyMessage).toBe("No active SKUs are priced for this customer. Check Price groups or choose another customer.");
});
it("keeps cached eligible choices on failed refetch with recovery feedback", () => {
  state.data = [{ id: "sku", name: "Keg", brands: null }]; state.error = new Error("Refresh failed");
  const props = view();
  expect(props.disabled).toBe(false);
  expect(props.model.skus).toHaveLength(1);
  expect(renderToStaticMarkup(props.skuFeedback)).toContain("Showing last-known data");
  if (!isValidElement<{ retry: () => void }>(props.skuFeedback)) throw new Error("Missing pricing feedback");
  props.skuFeedback.props.retry(); expect(state.retry).toHaveBeenCalledOnce();
});
it("flags customer-incompatible selections without deleting IDs or quantities and guards actual submission", () => {
  state.data = [{ id: "sku", name: "Keg", brands: null }];
  view().controls!.customer!("b");
  state.data = [{ id: "other", name: "Other Keg", brands: null }];
  const props = view();
  expect(props.model.lines[0]).toMatchObject({ skuId: "sku", qty: "3", name: "Fixture Beer Keg", skuError: expect.stringContaining("unavailable") });
  expect(props.disabled).toBe(true);
  const blocked = { preventDefault: vi.fn(), stopPropagation: vi.fn() }; form().props.onSubmit(blocked);
  expect(state.submit).not.toHaveBeenCalled(); expect(blocked.preventDefault).toHaveBeenCalled(); expect(blocked.stopPropagation).toHaveBeenCalled();
  state.data = [{ id: "sku", name: "Keg", brands: null }];
  expect(view().disabled).toBe(false);
  expect(view().model.lines[0].skuError).toBeUndefined();
  const allowed = { preventDefault: vi.fn() }; form().props.onSubmit(allowed);
  expect(state.submit).toHaveBeenCalledWith(allowed);
});
it("guards submission during a cold customer transition", () => {
  view().controls!.customer!("b");
  state.error = new Error("Pricing unavailable");
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }; form().props.onSubmit(event);
  expect(state.submit).not.toHaveBeenCalled(); expect(event.preventDefault).toHaveBeenCalled();
});
it("links a retained SKU error to its picker trigger without unsupported button validity", () => {
  state.useState.mockReturnValue([false, vi.fn()]);
  const picker = OrderSkuPicker({ value: "sku", label: "Line 1 SKU", options: [], selectedLabel: "Fixture Beer Keg", errorId: "sku-error" });
  expect(picker.props.trigger.props["aria-describedby"]).toBeTruthy();
  expect(picker.props.trigger.props["aria-invalid"]).toBeUndefined();
  expect(picker.props.trigger.props["aria-describedby"]).toBe("sku-error");
});
it("shared picker does not label a pending request as no matching SKUs", () => {
  state.useState.mockReturnValue([false, vi.fn()]);
  const picker = OrderSkuPicker({ value: "sku", label: "Line 1 SKU", options: [], selectedLabel: "Fixture Beer Keg", optionsReady: false, feedback: createElement("p", null, "Loading customer-priced SKUs") });
  expect(picker.props.trigger.props.children).toBe("Fixture Beer Keg");
  expect(renderToStaticMarkup(picker.props.children)).not.toContain("No matching SKUs");
});

it("asks the existing query for each customer channel and disables it without a wholesale customer", () => {
  form(); expect(state.queryCalls.at(-1)).toEqual(["list_skus", { saleChannelId: "a" }, true]);
  customer = "b"; form(); expect(state.queryCalls.at(-1)).toEqual(["list_skus", { saleChannelId: "b" }, true]);
  kind = "taproom_transfer"; const transfer = view();
  expect(transfer.model.skus).toEqual(skus);
  expect(transfer.skuOptionsReady).toBe(true);
  expect(transfer.skuFeedback).toBeUndefined();
  expect(state.queryCalls.at(-1)).toEqual(["list_skus", { saleChannelId: undefined }, false]);
  kind = "wholesale"; customer = ""; form(); expect(state.queryCalls.at(-1)).toEqual(["list_skus", { saleChannelId: undefined }, false]);
});
it("renders error linkage and genuine empty guidance through the actual shared view", () => {
  state.data = [];
  const props = view(); state.useState.mockReturnValue([false, vi.fn()]);
  const html = renderToStaticMarkup(createElement(NewOrderView, props));
  expect(html).toContain('id="test-error-sku-0"');
  expect(html).toContain('aria-describedby="test-error-sku-0"');
  expect(html).toContain("This SKU is unavailable");
  const picker = OrderSkuPicker({ value: "", label: "SKU", options: [], emptyMessage: props.skuEmptyMessage });
  expect(renderToStaticMarkup(picker.props.children)).toContain("No active SKUs are priced for this customer");
});

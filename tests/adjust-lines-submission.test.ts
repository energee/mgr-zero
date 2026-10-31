// The Order page's line edit (shared with Confirm order's quantity edit) holds
// blank reasons before running a command, and sends every kept and added line
// with adjust_order_lines; lines add and remove in place on the order (#1503).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import type * as ReactModule from "react";

const harness = vi.hoisted(() => ({ values: [] as unknown[], setters: [] as ReturnType<typeof vi.fn>[], run: vi.fn(), setError: vi.fn(), busy: false }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof ReactModule>(),
  useState: (initial: unknown) => {
    const set = vi.fn();
    harness.setters.push(set);
    return [harness.values.length ? harness.values.shift() : typeof initial === "function" ? initial() : initial, set];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => ({
  busy: harness.busy, error: null, run: harness.run, setError: harness.setError,
}) }));

import { OrderLinesEditor } from "@/app/(app)/orders/[id]/order-lines-form";
import { orderConfirmedWholesale } from "@/lib/mgr/fixtures/orders";
import { toOrderViewProps } from "@/lib/mgr/order-view";

beforeEach(() => { harness.values = []; harness.setters = []; harness.busy = false; vi.clearAllMocks(); });

const lines = [{ id: "line", sku_id: "sku", qty_ordered: 5 }, { id: "gone", sku_id: "old", qty_ordered: 1 }];

/** useLineQuantities' state, in its useState order: quantities, reason, added lines, removed line ids. */
function submit(state: { qtys?: Record<string, string>; reason: string; added?: { key: string; skuId: string }[]; removed?: string[] }, nested = false) {
  const form = {};
  const event = { preventDefault: vi.fn(), target: nested ? {} : form, currentTarget: form } as unknown as FormEvent<HTMLFormElement>;
  harness.values = [state.qtys ?? { line: "2", gone: "1" }, state.reason, state.added ?? [], state.removed ?? []];
  OrderLinesEditor({
    orderId: "order", lines, editable: true, skus: [], warnings: [], onSaved: vi.fn(),
    model: toOrderViewProps(orderConfirmedWholesale),
  }).props.onSubmit(event);
}

describe("order line edit submit boundaries", () => {
  it("holds blank reasons with the required message", () => {
    for (const reason of ["", "   ", "\t\r\n", "  ", "﻿　"]) submit({ reason });
    expect(harness.run).not.toHaveBeenCalled();
    expect(harness.setError).toHaveBeenCalledTimes(5);
    expect(harness.setError).toHaveBeenCalledWith("Reason required");
  });

  it("sends a trimmed reason with every line", () => {
    submit({ reason: " \tCustomer cut\n " });
    expect(harness.run).toHaveBeenCalledOnce();
    expect(harness.run.mock.calls[0].slice(0, 2)).toEqual(["adjust_order_lines", {
      orderId: "order", reason: "Customer cut", lines: [{ skuId: "sku", qty: 2 }, { skuId: "old", qty: 1 }],
    }]);
  });

  it("leaves a removed line out and sends an added one with its quantity", () => {
    submit({ qtys: { line: "5", gone: "1", n1: "3" }, reason: "Swap", added: [{ key: "n1", skuId: "new" }], removed: ["gone"] });
    expect(harness.run.mock.calls[0][1]).toEqual({
      orderId: "order", reason: "Swap", lines: [{ skuId: "sku", qty: 5 }, { skuId: "new", qty: 3 }],
    });
  });

  it("names an added line with no SKU instead of dropping it", () => {
    submit({ qtys: { line: "5", gone: "1", n1: "3" }, reason: "Add", added: [{ key: "n1", skuId: "" }] });
    expect(harness.run).not.toHaveBeenCalled();
    expect(harness.setError).toHaveBeenCalledWith("Choose a SKU for each added line, or remove it.");
  });

  it("does not resend while busy", () => {
    harness.busy = true;
    submit({ reason: "Customer cut" });
    expect(harness.run).not.toHaveBeenCalled();
  });

  it("keeps nested Cancel order submissions out of the shared Order/Confirm line handler", () => {
    submit({ reason: "Customer cut" }, true);
    expect(harness.run).not.toHaveBeenCalled();
  });
});

/** The Pickup switch's state, after useLineQuantities' four: seeded from the order, held locally so a click
 *  between the save and its refresh sends the new value, not the server's old one. */
function pickupSwitch(local?: boolean) {
  harness.values = [{ line: "5", gone: "1" }, "", [], [], ...(local === undefined ? [] : [local])];
  harness.setters = [];
  const form = OrderLinesEditor({
    orderId: "order", lines, editable: true, skus: [], warnings: [], onSaved: vi.fn(),
    model: toOrderViewProps(orderConfirmedWholesale), pickup: { value: true },
  });
  // The form draws OrderView first, then the reorder message.
  return form.props.children[0].props.pickup as { value: boolean; onChange: (value: boolean) => void };
}

describe("order pickup switch", () => {
  it("draws its own state, seeded from the order, and flips it only once the save succeeds", () => {
    expect(pickupSwitch().value).toBe(true);
    const pickup = pickupSwitch(false);
    expect(pickup.value).toBe(false);
    pickup.onChange(true);
    expect(harness.run.mock.calls[0].slice(0, 2)).toEqual(["set_order_pickup", { orderId: "order", pickup: true }]);
    expect(harness.setters[4]).not.toHaveBeenCalled();
    harness.run.mock.calls[0][2]();
    expect(harness.setters[4]).toHaveBeenCalledWith(true);
  });
});

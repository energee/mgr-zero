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

/** useLineQuantities' state, in its useState order: quantities, reason (the note), added lines, removed line ids,
 *  reason code. The Order page edits only confirmed or picked orders, so a change there names a reason code. */
function submit(state: { qtys?: Record<string, string>; reason?: string; code?: string; added?: { key: string; skuId: string }[]; removed?: string[] }, nested = false) {
  const form = {};
  const event = { preventDefault: vi.fn(), target: nested ? {} : form, currentTarget: form } as unknown as FormEvent<HTMLFormElement>;
  harness.values = [state.qtys ?? { line: "2", gone: "1" }, state.reason ?? "", state.added ?? [], state.removed ?? [], state.code ?? "customer_request"];
  OrderLinesEditor({
    orderId: "order", lines, editable: true, skus: [], warnings: [], onSaved: vi.fn(),
    model: toOrderViewProps(orderConfirmedWholesale),
  }).props.onSubmit(event);
}

describe("order line edit submit boundaries", () => {
  it("holds a change with no reason code", () => {
    submit({ reason: "Customer cut", code: "" });
    expect(harness.run).not.toHaveBeenCalled();
    expect(harness.setError).toHaveBeenCalledWith("Choose a reason");
  });

  it("holds Other with a blank note", () => {
    for (const reason of ["", "   ", "\t\r\n", "\u00a0\u2003", "\ufeff\u3000"]) submit({ reason, code: "other" });
    expect(harness.run).not.toHaveBeenCalled();
    expect(harness.setError).toHaveBeenCalledTimes(5);
    expect(harness.setError).toHaveBeenCalledWith("Add a note for Other");
  });

  it("sends the code and a trimmed note with every line", () => {
    submit({ reason: " \tPallet dropped\n ", code: "damaged" });
    expect(harness.run).toHaveBeenCalledOnce();
    expect(harness.run.mock.calls[0].slice(0, 2)).toEqual(["adjust_order_lines", {
      orderId: "order", reasonCode: "damaged", reason: "Pallet dropped", lines: [{ skuId: "sku", qty: 2 }, { skuId: "old", qty: 1 }],
    }]);
  });

  it("leaves a blank note out", () => {
    submit({ reason: "  ", code: "short" });
    expect(harness.run.mock.calls[0][1]).toEqual({ orderId: "order", reasonCode: "short", lines: [{ skuId: "sku", qty: 2 }, { skuId: "old", qty: 1 }] });
  });

  it("leaves a removed line out and sends an added one with its quantity", () => {
    submit({ qtys: { line: "5", gone: "1", n1: "3" }, reason: "Swap", added: [{ key: "n1", skuId: "new" }], removed: ["gone"] });
    expect(harness.run.mock.calls[0][1]).toEqual({
      orderId: "order", reasonCode: "customer_request", reason: "Swap", lines: [{ skuId: "sku", qty: 5 }, { skuId: "new", qty: 3 }],
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

/** The Pickup switch's state, after useLineQuantities' five: seeded from the order, held locally so a click
 *  between the save and its refresh sends the new value, not the server's old one. */
function pickupSwitch(local?: boolean) {
  harness.values = [{ line: "5", gone: "1" }, "", [], [], "", ...(local === undefined ? [] : [local])];
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
    expect(harness.setters[5]).not.toHaveBeenCalled();
    harness.run.mock.calls[0][2]();
    expect(harness.setters[5]).toHaveBeenCalledWith(true);
  });
});

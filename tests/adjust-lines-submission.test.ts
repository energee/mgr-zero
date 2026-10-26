// Actual Order/Confirm shared handler and Adjust lines form must hold blank reasons before running a command.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import type * as ReactModule from "react";

const harness = vi.hoisted(() => ({ values: [] as unknown[], run: vi.fn(), setError: vi.fn(), busy: false }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof ReactModule>(),
  useState: (initial: unknown) => [harness.values.length ? harness.values.shift() : typeof initial === "function" ? initial() : initial, vi.fn()],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => ({
  busy: harness.busy, error: null, run: harness.run, setError: harness.setError,
}) }));

import { OrderLinesForm } from "@/app/(app)/orders/[id]/order-lines-form";
import { AdjustLinesForm } from "@/app/(app)/orders/[id]/adjust-lines-form";
import { orderConfirmedWholesale } from "@/lib/mgr/fixtures/orders";
import { toOrderViewProps } from "@/lib/mgr/order-view";

beforeEach(() => { harness.values = []; harness.busy = false; vi.clearAllMocks(); });

function submit(surface: "inline" | "adjust", reason: string, nested = false) {
  const form = {};
  const event = { preventDefault: vi.fn(), target: nested ? {} : form, currentTarget: form } as unknown as FormEvent<HTMLFormElement>;
  if (surface === "inline") {
    harness.values = [{ line: "2" }, reason];
    OrderLinesForm({
      orderId: "order", lines: [{ id: "line", sku_id: "sku", qty_ordered: 5 }],
      editable: true, model: toOrderViewProps(orderConfirmedWholesale),
    }).props.onSubmit(event);
  } else {
    harness.values = [[{ skuId: "sku", qty: "2" }], reason, []];
    AdjustLinesForm({ orderId: "order", currentLines: [], skus: [] }).props.onSubmit(event);
  }
}

describe("adjustment reason submit boundaries", () => {
  it.each(["inline", "adjust"] as const)("holds blank %s submissions with the required message", surface => {
    for (const reason of ["", "   ", "\t\r\n", "\u00a0\u2003", "\ufeff\u3000"]) submit(surface, reason);
    expect(harness.run).not.toHaveBeenCalled();
    expect(harness.setError).toHaveBeenCalledTimes(5);
    expect(harness.setError).toHaveBeenCalledWith("Reason required");
  });

  it.each(["inline", "adjust"] as const)("sends trimmed valid %s reasons with all lines", surface => {
    submit(surface, " \tCustomer cut\n ");
    expect(harness.run).toHaveBeenCalledOnce();
    expect(harness.run.mock.calls[0].slice(0, 2)).toEqual(["adjust_order_lines", {
      orderId: "order", reason: "Customer cut", lines: [{ skuId: "sku", qty: 2 }],
    }]);
  });

  it.each(["inline", "adjust"] as const)("does not resend %s while busy", surface => {
    harness.busy = true;
    submit(surface, "Customer cut");
    expect(harness.run).not.toHaveBeenCalled();
  });

  it("keeps nested Cancel order submissions out of the shared Order/Confirm line handler", () => {
    submit("inline", "Customer cut", true);
    expect(harness.run).not.toHaveBeenCalled();
  });
});

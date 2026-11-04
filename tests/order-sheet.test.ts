// tests/order-sheet.test.ts — the order sheet's address (lib/mgr/order-sheet.ts):
// ?order=<id> on whatever list is open, so filters survive and a refresh or a
// shared link reopens the same sheet; Today and Work rows carry the order id only
// when their subject is an order.
import { describe, expect, it } from "vitest";
import { orderSheetHref, orderSheetId } from "../lib/mgr/order-sheet";
import { toTodayViewProps } from "../lib/mgr/today-view";
import { workFromQuery } from "../lib/mgr/work-view";
import type { TodayItem } from "../lib/commands/today";

describe("orderSheetId", () => {
  it("takes one well-formed order id from the address, and nothing else", () => {
    const id = "b060b9b6-13ba-4da8-8e01-20f9db77d11d";
    expect(orderSheetId(id)).toBe(id);
    expect(orderSheetId(undefined)).toBeUndefined();
    expect(orderSheetId("ORD-0218")).toBeUndefined();
    expect(orderSheetId([id, id])).toBeUndefined();
  });
});

describe("orderSheetHref", () => {
  it("adds the order to the current list address and keeps its filters", () => {
    expect(orderSheetHref("/orders", "status=picked", "o1")).toBe("/orders?status=picked&order=o1");
    expect(orderSheetHref("/", "", "o1")).toBe("/?order=o1");
  });
  it("replaces an open order, and closing drops only the order", () => {
    expect(orderSheetHref("/orders", "order=o1&status=picked", "o2")).toBe("/orders?status=picked&order=o2");
    expect(orderSheetHref("/orders", "status=picked&order=o1", null)).toBe("/orders?status=picked");
    expect(orderSheetHref("/", "order=o1", null)).toBe("/");
  });
});

const item = (over: Partial<TodayItem>): TodayItem => ({
  reason: "pick_due", subjectType: "order", subjectId: "o1", sourceVersion: "1", safeLabel: "ORD-1",
  customerName: null, detail: "", amountCents: null, dueAt: null, href: "/orders/o1/pick", recipientRoles: ["warehouse"], assignedUserId: null, ...over,
});

describe("rows that open an order", () => {
  it("Today names the order only when the row's subject is one", () => {
    const model = toTodayViewProps({ items: [item({}), item({ reason: "invoice_question", subjectType: "invoice", subjectId: "q1" })] });
    expect(model.rows.map((r) => r.orderId)).toEqual(["o1", undefined]);
  });
  it("Work passes the order id through to its row", () => {
    const model = workFromQuery([{ kind: "orders", id: "o1", orderId: "o1", label: "ORD-1", detail: "", href: "/orders/o1/pick", verb: "Pick", tone: "info", dueAt: null }], ["orders"]);
    expect(model.rows[0].orderId).toBe("o1");
  });
});

describe("a sheet for an order that is not there", () => {
  it("reads as no order, so the sheet stays closed instead of the page turning not-found", async () => {
    const { orNull } = await import("../lib/mgr/not-found");
    const { CommandError } = await import("../lib/commands/registry");
    await expect(orNull(Promise.reject(new CommandError("gone", 404, "not_found")))).resolves.toBeNull();
    await expect(orNull(Promise.reject(new CommandError("bad id", 400, "invalid_input")))).resolves.toBeNull();
    await expect(orNull(Promise.resolve("order"))).resolves.toBe("order");
    await expect(orNull(Promise.reject(new CommandError("down", 500, "internal")))).rejects.toThrow("down");
  });
});

// tests/today-view.test.ts — Today rows keep a real dueAt and print it in the brewery's zone (#717).
import { describe, expect, it } from "vitest";
import { toTodayViewProps } from "../lib/mgr/today-view";
import type { TodayItem } from "../lib/commands/today";
import { todayWarehouse } from "../lib/mgr/fixtures/today";

const item = (subjectId: string, dueAt: string | null, reason: TodayItem["reason"] = "fermentation_reading_overdue"): TodayItem => ({
  reason,
  subjectType: "occupancy",
  subjectId,
  sourceVersion: "1",
  safeLabel: `FV-${subjectId}`,
  customerName: null,
  detail: "Reading due",
  amountCents: null,
  dueAt,
  href: `/cellar/${subjectId}`,
  recipientRoles: ["brewer"],
  assignedUserId: null,
});

const now = new Date("2026-10-08T18:00:00Z"); // 2:00 PM in New York
const timeZone = "America/New_York";

describe("Today row titles", () => {
  it("names the customer beside an order number, in its own column, so the row can be acted on (#1512)", () => {
    const order: TodayItem = { ...item("o1", null, "pick_due"), subjectType: "order", safeLabel: "ORD-0193", customerName: "Hillside Tavern" };
    const model = toTodayViewProps({ items: [order, item("2", null)], timeZone, now });
    expect(model.rows.map((r) => [r.title, r.customer])).toEqual([["ORD-0193", "Hillside Tavern"], ["FV-2", undefined]]);
  });
});

describe("Today states", () => {
  it("names each reason's state for the State column", () => {
    const model = toTodayViewProps({ items: [item("1", null, "pick_due"), item("2", null, "invoice_question")], timeZone, now });
    expect(model.rows.map((r) => r.state)).toEqual(["Pick due", "Question"]);
  });
});

describe("Today due times", () => {
  it("keeps dueAt and names overdue and upcoming times in the brewery zone", () => {
    const model = toTodayViewProps({
      items: [item("1", "2026-10-07T13:00:00Z"), item("2", "2026-10-08T16:30:00Z"), item("3", "2026-10-08T22:00:00Z")],
      timeZone,
      now,
    });
    // Overdue is the State column's badge, so the detail keeps only the time.
    expect(model.rows.map((r) => [r.dueAt, r.detail, r.overdue])).toEqual([
      ["2026-10-07T13:00:00Z", "Reading due · since Oct 7, 2026, 9:00 AM", true],
      ["2026-10-08T16:30:00Z", "Reading due · since 12:30 PM", true],
      ["2026-10-08T22:00:00Z", "Reading due · due 6:00 PM", undefined],
    ]);
  });

  it("never invents a deadline for a task without dueAt", () => {
    const model = toTodayViewProps({ items: [item("1", null)], timeZone, now });
    expect(model.rows[0].detail).toBe("Reading due");
    expect(model.rows[0]).not.toHaveProperty("dueAt");
  });

  it("adds no clock time to a date-only deadline such as a ship date", () => {
    const model = toTodayViewProps({ items: [{ ...item("1", "2026-10-08T04:00:00Z", "pick_due"), subjectType: "order", detail: "pick due · ships Oct 8, 2026" }], timeZone, now });
    expect(model.rows[0]).toMatchObject({ ships: "Oct 8", detail: "", dueAt: "2026-10-08T04:00:00Z" });
  });

  it("marks a ship or route date before the brewery's today as overdue (#993)", () => {
    // Ship dates arrive as midnight of their brewery day; Oct 7 is yesterday in New York.
    const model = toTodayViewProps({ items: [
      { ...item("1", "2026-10-07T04:00:00Z", "pick_due"), subjectType: "order", detail: "pick due · ships Oct 7, 2026" },
      { ...item("2", "2026-10-08T04:00:00Z", "submitted_order"), subjectType: "order", detail: "submitted · ships Oct 8, 2026" },
      { ...item("3", "2026-10-07T04:00:00Z", "submitted_order"), subjectType: "order", detail: "submitted · ships Oct 7, 2026" },
    ], timeZone, now });
    expect(model.rows.map((r) => [r.ships, r.overdue, r.warning])).toEqual([
      ["Oct 7", true, true],
      ["Oct 8", undefined, false],
      ["Oct 7", true, true],
    ]);
  });

  it("the warehouse inventory frame draws an overdue pick row with the attention dot (#1037)", () => {
    // lib/mgr/fixtures/today.ts builds this row through toTodayViewProps from a get_today item.
    const row = todayWarehouse.rows.find((r) => r.title === "ORD-0228");
    expect(row).toMatchObject({ customer: "Hillside Tavern", state: "Pick due", overdue: true, ships: "Sep 2", amount: "$1,240.00", detail: "", verb: "Pick", warning: true, icon: "package" });
    expect(row?.href).toBeUndefined();
  });

  it("needs the brewery zone to judge a date-only deadline", () => {
    expect(() => toTodayViewProps({ items: [item("1", "2026-10-07T04:00:00Z", "pick_due")], now })).toThrow(/time zone/);
  });
});

describe("Today order rows", () => {
  const order = (reason: TodayItem["reason"], dueAt: string | null, detail: string, amountCents: number | null): TodayItem =>
    ({ ...item("o1", dueAt, reason), subjectType: "order", detail, amountCents });

  it("draws the ship date and the order amount as their own cells, and keeps only what the detail adds", () => {
    const model = toTodayViewProps({ items: [
      order("pick_due", "2026-10-08T04:00:00Z", "pick due · ships Oct 8, 2026 · changed after pick", 24050),
      order("submitted_order", "2026-10-08T04:00:00Z", "submitted · ships Oct 8, 2026", 0),
      order("pick_due", null, "pick due · no ship date", null),
      order("restock_due", null, "restock staged beer", 1200),
    ], timeZone, now });
    expect(model.rows.map((r) => [r.ships, r.amount, r.detail])).toEqual([
      ["Oct 8", "$240.50", "changed after pick"],
      ["Oct 8", "$0.00", ""],
      [undefined, undefined, "no ship date"],
      [undefined, "$12.00", "restock staged beer"],
    ]);
  });

  it("leaves a non-order row's detail alone", () => {
    const model = toTodayViewProps({ items: [{ ...item("1", null, "invoice_question"), detail: "buyer asked: is this kegged?" }], timeZone, now });
    expect(model.rows[0]).toMatchObject({ detail: "buyer asked: is this kegged?" });
    expect(model.rows[0]).not.toHaveProperty("ships");
    expect(model.rows[0]).not.toHaveProperty("amount");
  });
});

describe("Today table", () => {
  it("draws one table line per entry, its detail cut short rather than wrapped", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { TodayView } = await import("../components/mgr/views/today");
    const { todaySales } = await import("../lib/mgr/fixtures/today");
    const markup = renderToStaticMarkup(createElement(TodayView, { model: todaySales }));
    const body = markup.slice(markup.indexOf("<tbody"), markup.indexOf("</tbody>"));
    expect(body.match(/<tr\b/g)).toHaveLength(todaySales.rows.length);
    expect(body).toContain("truncate");
  });

  it("heads its columns on the desk, and leaves out Customer when no row has one", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { TodayView } = await import("../components/mgr/views/today");
    const { todaySales, todayTaproom } = await import("../lib/mgr/fixtures/today");
    const heads = (model: typeof todaySales) => [...renderToStaticMarkup(createElement(TodayView, { model })).matchAll(/<th [^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<span class="sr-only">.*?<\/span>/g, ""));
    expect(heads(todaySales)).toEqual(["", "Item", "Customer", "State", "Ships", "Amount", "Detail", ""]);
    expect(heads(todayTaproom)).toEqual(["", "Item", "Detail", ""]);
  });
});

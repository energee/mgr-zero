// tests/order-view.test.ts — the Order inventory record and the live order
// page share one drawing (OrderView). Fixtures are get_order snapshots;
// toOrderViewProps paints both the docs frame and the live page.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { OrderView } from "../components/mgr/views/order";
import { orderConfirmedWholesale, orderPickedRestock } from "../lib/mgr/fixtures/orders";
import { orderLineCents, toOrderViewProps, type OrderSnapshot } from "../lib/mgr/order-view";

const PAGE = "app/(app)/orders/[id]/page.tsx";

describe("Order view loop", () => {
  it("draws Ordered as the shared number field, plus Reason, when lines can be adjusted in place", () => {
    const model = toOrderViewProps(orderConfirmedWholesale);
    const read = renderToStaticMarkup(createElement(OrderView, { model }));
    expect(read).not.toMatch(/aria-label="Decrease"/);
    const key = model.lines[0].key;
    const edit = renderToStaticMarkup(createElement(OrderView, { model, quantities: { [key]: "7" }, onQuantity: () => {}, reason: "", onReason: () => {}, lineActions: "SAVE" }));
    // Desktop table and phone list each draw one field per line.
    expect(edit.match(/aria-label="Decrease"/g)).toHaveLength(model.lines.length * 2);
    expect(edit).toMatch(/value="7"/);
    expect(edit).toMatch(/Reason/);
    expect(edit).toContain("SAVE");
  });

  it("names who made each history entry: staff by name, a portal buyer by email", () => {
    const events = [
      { id: "e1", event: "submitted", actor: "buyer-id", payload: {}, created_at: "2026-10-16T13:02:00.000Z" },
      { id: "e2", event: "lines_adjusted", actor: "staff-id", payload: { before: {}, lines: [], reason: "call" }, created_at: "2026-10-16T13:04:00.000Z" },
      { id: "e3", event: "confirmed", actor: "gone-id", payload: {}, created_at: "2026-10-16T13:05:00.000Z" },
    ];
    const model = toOrderViewProps({ ...orderPickedRestock, events, actorNames: { "buyer-id": "buyer@bar.com", "staff-id": "Ted Brewer" } });
    expect(model.events.map((e) => e.by)).toEqual(["buyer@bar.com", "Ted Brewer", "a user not on the team"]);
    expect(renderToStaticMarkup(createElement(OrderView, { model }))).toContain("Lines adjusted by Ted Brewer");
  });

  it.each([null, "", "   ", "\t\n"])("names an absent Customer PO %j", po_number => {
    const model = toOrderViewProps({ ...orderPickedRestock, order: { ...orderPickedRestock.order, po_number } });
    expect(model.facts).toContainEqual({ label: "Customer PO", value: "Not specified" });
  });

  it.each(["", "   ", "\t\n", "\u00a0\u2003"])("omits the separator for a historical blank cancellation reason %j", reason => {
    const model = toOrderViewProps({
      ...orderPickedRestock,
      events: [{ id: "cancelled", event: "cancelled", actor: "staff", payload: { reason }, created_at: "2026-10-25T12:00:00.000Z" }],
      actorNames: { staff: "QA Staff" },
    });
    expect(model.events[0].detail).toBe("");
    const markup = renderToStaticMarkup(createElement(OrderView, { model }));
    expect(markup).toContain("Cancelled by QA Staff");
    expect(markup).not.toContain(" · </span>");
  });

  it("maps the shared fixture through the adapter", () => {
    const model = toOrderViewProps(orderPickedRestock);
    expect(model.title).toBe("ORD-0229");
    expect(model.customer).toBe("Al’s Bar");
    expect(model.kind).toBe("Wholesale");
    expect(model.currentState).toBe("Picked · restock pending");
    expect(model.next).toBe("Next: put back");
    expect(model.facts).toContainEqual({ label: "Customer PO", value: "4471" });
    expect(model.facts).toContainEqual({ label: "Fulfillment source", value: "Warehouse" });
    expect(model.facts).toContainEqual({ label: "Ship-to", value: "Main · Columbus, OH" });
    expect(model.facts).toContainEqual({ label: "Requested ship date", value: "Not specified" });
    expect(model.putBackHref).toBe("#");
    expect(model.lines[0]).toMatchObject({ ordered: "4", picked: "4", shipped: "Not recorded", atp: "11", unitPrice: "$150.00", amount: "$600.00" });
    expect(model.lines[1]).toMatchObject({ atp: "Not supplied", warning: "Picked 10, more than ordered" });
    expect(model.events.at(-1)).toMatchObject({ event: "Lines adjusted", detail: "Pils · 16 oz case 10 to Pils · 16 oz case 7 (customer cut)" });
  });

  it("prints the requested ship date in the one date format (#991)", () => {
    const model = toOrderViewProps({ ...orderPickedRestock, order: { ...orderPickedRestock.order, requested_ship_date: "2026-09-14" } });
    expect(model.facts).toContainEqual({ label: "Requested ship date", value: "Sep 14, 2026" });
  });

  it("lists keg charges: each deposit, and the one-way fee per one-way keg line (frozen at submit)", () => {
    const lines = orderPickedRestock.lines.map((l) => l.id === "l-stout" ? { ...l, one_way_fee_cents: 1000 } : l);
    const deposits = [{ order_line_id: "l-hazy", description: "Lolev kegs deposit", qty_ordered: 4, unit_price_cents: 3000, amount_cents: 12000 }];
    const model = toOrderViewProps({ ...orderPickedRestock, lines, deposits });
    expect(model.kegCharges).toEqual([
      { key: "deposit-l-hazy", name: "Lolev kegs deposit · Hazy IPA · ½ bbl keg", detail: "4 × $30.00 · captured on the order", amount: "$120.00" },
      { key: "fee-l-stout", name: "One-way keg fee · Stout · ⅙ bbl keg", detail: "2 × $10.00 · captured on the order", amount: "$20.00" },
    ]);
    expect(toOrderViewProps({ ...orderPickedRestock, lines: orderPickedRestock.lines.map(l => ({ ...l, one_way_fee_cents: null })), deposits: [] }).kegCharges).toEqual([]);
    const html = renderToStaticMarkup(createElement(OrderView, { model, footer: null }));
    expect(html).toContain("Keg charges");
    expect(html).toContain("One-way keg fee");
  });

  it("shows a line's shortage reason to staff (#624)", () => {
    const lines = orderPickedRestock.lines.map((l) => l.id === "l-pils" ? { ...l, short_reason: "one case crushed" } : l);
    const model = toOrderViewProps({ ...orderPickedRestock, lines });
    expect(model.lines[1]?.shortReason).toBe("one case crushed");
    expect(model.lines[0]?.shortReason).toBeUndefined();
    expect(renderToStaticMarkup(createElement(OrderView, { model }))).toContain("Short: one case crushed");
  });

  it("marks an order changed after pick (#811) and draws nothing when it was not", () => {
    const changed = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "confirmed" as const, needs_restock: false, repick_since: "2026-09-02T14:00:00.000Z" } };
    const model = toOrderViewProps(changed);
    expect(model.repickNote).toMatch(/^Changed after pick/);
    const html = renderToStaticMarkup(createElement(OrderView, { model }));
    expect(html).toContain("changed after pick");
    expect(html).toContain("the rest is already staged");
    expect(toOrderViewProps(orderPickedRestock).repickNote).toBeUndefined();
    expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(orderPickedRestock) }))).not.toContain("changed after pick");
  });

  it("names a foreign ship-to's country and never prints a missing part as null", () => {
    const jp = { ...orderPickedRestock, order: { ...orderPickedRestock.order, ship_tos: { label: "Main", country: "JP", city: null, state: null } } };
    expect(toOrderViewProps(jp).facts).toContainEqual({ label: "Ship-to", value: "Main · Japan" });
    expect(JSON.stringify(toOrderViewProps(jp))).not.toContain("null");
  });

  it("says Pickup on a pickup order and nothing otherwise", () => {
    const pickup = { ...orderPickedRestock, order: { ...orderPickedRestock.order, pickup: true } };
    expect(toOrderViewProps(pickup).facts).toContainEqual({ label: "Ship-to", value: "Pickup" });
    expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(pickup) }))).toContain("Pickup");
    expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(orderPickedRestock) }))).not.toContain("Pickup");
  });

  it("a cancelled order that was changed after pick carries no re-pick note (#811)", () => {
    const cancelled = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "cancelled" as const, repick_since: "2026-09-02T14:00:00.000Z" } };
    expect(toOrderViewProps(cancelled).repickNote).toBeUndefined();
  });

  describe("Cost line (#810 PR2)", () => {
    const shipped = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "shipped" as const, needs_restock: false } };
    const costLine = (cogs?: { cost_cents: number; revenue_cents: number; uncosted_qty: number; margin_pct: number | null }, snapshot: OrderSnapshot = shipped) =>
      toOrderViewProps({ ...snapshot, cogs }).costLine;

    it("shows cost and margin on a shipped order", () => {
      expect(costLine({ cost_cents: 150000, revenue_cents: 360000, uncosted_qty: 0, margin_pct: 58.3 })).toBe("$1,500.00 · margin 58.3%");
      const html = renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps({ ...shipped, cogs: { cost_cents: 150000, revenue_cents: 360000, uncosted_qty: 0, margin_pct: 58.3 } }) }));
      expect(html).toContain("$1,500.00 · margin 58.3%");
    });

    it.each([[1, "1 unit"], [2, "2 units"], [1.5, "1.5 units"]] as const)("withholds the margin and names %s uncosted units (#1382)", (uncosted_qty, label) => {
      const line = costLine({ cost_cents: 1000, revenue_cents: 24000, uncosted_qty, margin_pct: null });
      expect(line).toContain("$10.00");
      expect(line).toMatch(new RegExp(`\\b${label.replace(".", "\\.")}\\b`));
      expect(line).toMatch(/margin.*withheld/i);
    });

    it("draws nothing without get_order_cogs data or before the order ships", () => {
      expect(costLine(undefined)).toBeUndefined();
      expect(costLine({ cost_cents: 1000, revenue_cents: 24000, uncosted_qty: 0, margin_pct: 95.8 }, orderPickedRestock)).toBeUndefined();
      expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(shipped) }))).not.toContain("margin");
    });

    it("the live page asks only roles that may run get_order_cogs", () => {
      expect(readFileSync(PAGE, "utf8")).toMatch(/canRun\(ctx, "get_order_cogs"\)/);
    });
  });

  it("a confirmed order with staged beer still offers Put back (#811)", () => {
    const mixed = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "confirmed" as const, repick_since: "2026-09-02T14:00:00.000Z" } };
    const model = toOrderViewProps(mixed);
    expect(model.putBackHref).toBe("#");
    expect(model.next).toBe("Next: put back");
  });

  it("the Order inventory record is OrderView painted from that fixture", () => {
    const screen = SCREENS.find((s) => s.name === "Order");
    expect(isValidElement(screen!.body)).toBe(true);
    const body = screen!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(OrderView);
    expect(body.props.model).toEqual(toOrderViewProps(orderPickedRestock));
  });

  it("the inventory Order drawing still shows the exemplar verbs and restock copy", () => {
    const html = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Order")!.body));
    expect(html).toMatch(/>Add line</);
    // One Adjust per line in the desktop table and again in the phone list.
    expect(html.match(/data-row-action[^>]*>Adjust</g)).toHaveLength(6);
    expect(html).toMatch(/ORD-0229/);
    expect(html).toMatch(/Picked · restock pending/);
    expect(html).toMatch(/>Ship</);
    expect(html).toMatch(/Cancel order/);
  });

  it("the live Order page mounts OrderView via the adapter, with no second E.* tree", () => {
    // page.tsx adapts get_order; order-lines-form.tsx mounts the drawing with in-place quantities.
    const src = readFileSync(PAGE, "utf8");
    const form = readFileSync("app/(app)/orders/[id]/order-lines-form.tsx", "utf8");
    expect(src).toMatch(/from "@\/lib\/mgr\/order-view"/);
    expect(src).toMatch(/<OrderLinesForm\b/);
    expect(form).toMatch(/from "@\/components\/mgr\/views\/order"/);
    expect(form).toMatch(/<OrderView\b/);
    for (const file of [src, form]) {
      expect(file).not.toMatch(/from "@\/components\/mgr\/e"/);
      expect(file).not.toMatch(/\bE\.(back|row|ttl|fld|act|tape|btn)\b/);
    }
  });

  describe("Price summary (#976)", () => {
    const html = (snapshot: OrderSnapshot) => renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(snapshot), footer: null }));

    it("rounds each line to the nearest cent, half up, in integer cents", () => {
      expect(orderLineCents(0.5, 1)).toBe(1);
      expect(orderLineCents(1.15, 50)).toBe(58); // 1.15 * 50 is 57.4999… in binary floating point
      expect(orderLineCents(0.33, 150)).toBe(50);
      expect(orderLineCents(4, 12500)).toBe(50000);
      expect(orderLineCents(2.5, 0)).toBe(0);
    });

    it("sums the rounded lines, so two half-cent lines make 2 cents", () => {
      const lines = [0, 1].map((n) => ({ ...orderConfirmedWholesale.lines[0]!, id: `half-${n}`, sku_id: `sku-${n}`, qty_ordered: 0.5, unit_price_cents: 1, one_way_fee_cents: null }));
      const model = toOrderViewProps({ ...orderConfirmedWholesale, lines, deposits: [] });
      expect(model.lines.map((l) => l.amount)).toEqual(["$0.01", "$0.01"]);
      expect(model.summary.rows[0]).toEqual({ label: "Ordered items", value: "$0.02" });
      expect(model.summary.total?.value).toBe("$0.02");
    });

    it("a confirmed wholesale order adds items, frozen deposits and per-unit fees before tax", () => {
      const model = toOrderViewProps(orderConfirmedWholesale);
      expect(model.lines.map((l) => l.amount)).toEqual(["$500.00", "$240.00", "$288.00"]);
      expect(model.summary.rows).toEqual([
        { label: "Ordered items", value: "$1,028.00" },
        { label: "Returnable keg deposits", value: "$120.00" },
        { label: "One-way keg fees", value: "$24.00" },
      ]);
      expect(model.summary.total).toEqual({ label: "Order amount · before tax", value: "$1,172.00" });
      expect(model.summary.note).toMatch(/Not an invoice or balance due/);
      expect(html(orderConfirmedWholesale).match(/\$1,172\.00/g)).toHaveLength(1);
    });

    it("uses each deposit's frozen amount_cents verbatim", () => {
      const deposits = orderConfirmedWholesale.deposits!.map((d) => ({ ...d, amount_cents: 11999 }));
      expect(toOrderViewProps({ ...orderConfirmedWholesale, deposits }).summary.rows[1]?.value).toBe("$119.99");
    });

    it("a draft is an items estimate; deposits and fees are not finalized", () => {
      const draft = { ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, status: "draft" as const }, deposits: [] };
      const { summary } = toOrderViewProps(draft);
      expect(summary.total).toEqual({ label: "Items estimate", value: "$1,028.00" });
      expect(summary.rows).toEqual([{ label: "Keg deposits and fees", value: "Not finalized until submission" }]);
      expect(html(draft)).not.toContain("Order amount");
    });

    it("withholds the total while a charge collection was not supplied", () => {
      const noDeposits = { ...orderConfirmedWholesale, deposits: undefined };
      const noFees = { ...orderConfirmedWholesale, lines: orderConfirmedWholesale.lines.map((l) => ({ ...l, one_way_fee_cents: undefined })) };
      for (const snapshot of [noDeposits, noFees]) {
        const { summary } = toOrderViewProps(snapshot);
        expect(summary.total).toBeUndefined();
        expect(summary.rows).toEqual([{ label: "Ordered items", value: "$1,028.00" }]);
        expect(summary.note).toBe("Order amount unavailable: complete charge and line data required.");
      }
    });

    it("a shipped order keeps the ordered basis and says it is not the invoiced amount", () => {
      const shipped = { ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, status: "shipped" as const } };
      const { summary } = toOrderViewProps(shipped);
      expect(summary.total).toEqual({ label: "Order amount · before tax", value: "$1,172.00" });
      expect(summary.note).toMatch(/^Ordered quantities; not final invoiced amount\./);
    });

    it("submitted and picked orders carry the same before-tax total", () => {
      for (const status of ["submitted", "picked"] as const) {
        const { summary } = toOrderViewProps({ ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, status } });
        expect(summary.total).toEqual({ label: "Order amount · before tax", value: "$1,172.00" });
      }
    });

    it("withholds the total on a shipped or cancelled order without deposits, and a draft stays an estimate", () => {
      for (const status of ["shipped", "cancelled"] as const) {
        const { summary } = toOrderViewProps({ ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, status }, deposits: undefined });
        expect(summary.total).toBeUndefined();
        expect(summary.note).toBe("Order amount unavailable: complete charge and line data required.");
      }
      const draft = toOrderViewProps({ ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, status: "draft" }, deposits: undefined });
      expect(draft.summary.total).toEqual({ label: "Items estimate", value: "$1,028.00" });
    });

    it("rounds a fractional fee line per unit: 1.15 × 50¢ is 58¢", () => {
      const lines = [{ ...orderConfirmedWholesale.lines[1]!, qty_ordered: 1.15, unit_price_cents: 0, one_way_fee_cents: 50 }];
      const model = toOrderViewProps({ ...orderConfirmedWholesale, lines, deposits: [] });
      expect(model.summary.rows[2]).toEqual({ label: "One-way keg fees", value: "$0.58" });
      expect(model.kegCharges[0]?.amount).toBe("$0.58");
      expect(model.summary.total?.value).toBe("$0.58");
    });

    it("a draft cancelled before submit stays an items estimate: its charges were never frozen", () => {
      const cancelledDraft = { ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, status: "cancelled" as const }, deposits: [],
        events: [{ id: "e1", event: "created", actor: "Ted", payload: {}, created_at: "2026-10-16T13:02:00.000Z" }, { id: "e2", event: "cancelled", actor: "Ted", payload: { reason: "dup" }, created_at: "2026-10-16T13:04:00.000Z" }] };
      const { summary } = toOrderViewProps(cancelledDraft);
      expect(summary.total).toEqual({ label: "Items estimate", value: "$1,028.00" });
      expect(summary.rows).toEqual([{ label: "Keg deposits and fees", value: "Not finalized until submission" }]);
    });

    it("a cancelled order's amount is history, not an amount to collect", () => {
      const cancelled = { ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, status: "cancelled" as const } };
      const { summary } = toOrderViewProps(cancelled);
      expect(summary.total).toEqual({ label: "Cancelled order amount · before tax", value: "$1,172.00" });
      expect(summary.note).toMatch(/not an amount to collect/);
    });

    it("a taproom transfer is not a customer charge", () => {
      const transfer = { ...orderConfirmedWholesale, order: { ...orderConfirmedWholesale.order, kind: "taproom_transfer" as const, customers: null, ship_tos: null } };
      const model = toOrderViewProps(transfer);
      expect(model.customer).toBe("Taproom transfer");
      expect(model.summary).toEqual({ rows: [], note: "Taproom transfer · not a customer charge. No invoice or balance due." });
      expect(html(transfer)).not.toMatch(/before tax|Items estimate/);
    });

    it("keeps 0 as 0 and missing as unavailable", () => {
      const zero = { ...orderConfirmedWholesale, lines: [{ ...orderConfirmedWholesale.lines[1]!, qty_picked: 0, qty_shipped: 0 }] };
      expect(toOrderViewProps(zero).lines[0]).toMatchObject({ ordered: "3", picked: "0", shipped: "0", atp: "0" });
      expect(toOrderViewProps(orderConfirmedWholesale).lines[2]).toMatchObject({ picked: "Not recorded", shipped: "Not recorded", atp: "Not supplied" });
      expect(toOrderViewProps({ ...orderConfirmedWholesale, lines: [{ ...orderConfirmedWholesale.lines[0]!, qty_ordered: 2.25 }] }).lines[0]?.ordered).toBe("2.25");
    });

    it("draws a desktop table and labeled phone records from the same lines", () => {
      const out = html(orderConfirmedWholesale);
      for (const header of ["SKU", "Ordered", "Picked", "Shipped", "Brewery ATP", "Unit price", "Line amount"]) expect(out).toContain(`>${header}<`);
      expect(out).toMatch(/<dt[^>]*>Line amount<\/dt>/);
      expect(out).toContain("Price summary");
      expect(out).toContain("3 lines");
    });
  });
});

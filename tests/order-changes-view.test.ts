// tests/order-changes-view.test.ts — the staff report of changes after confirm
// (Phase C of docs/plans/portal-release-windows.md): rows, filters and empty
// states from list_order_changes, and the inventory record drawing the same view.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SCREENS } from "../components/mgr/screens";
import { OrderChangesView } from "../components/mgr/views/order-changes";
import { orderChangesScope, toOrderChangesViewProps, type OrderChangeRow } from "../lib/mgr/order-changes-view";
import { ORDER_CHANGE_REASONS } from "../lib/mgr/enums";

const row: OrderChangeRow = {
  id: "e1", created_at: "2026-09-02T17:15:00.000Z", order_id: "o1", order_no: 231, kind: "wholesale", customer_id: "c1", customer_name: "Ridgeline Taproom",
  actor: "u1", reason_code: "damaged", note: " Dropped on the dock ", changes: [{ sku_id: "s1", name: "Hazy IPA · ½ bbl keg", delta: -2 }],
};

describe("order changes report view-model", () => {
  it("reads each change as the order and customer over reason, lines, who, when and note", () => {
    const model = toOrderChangesViewProps({ rows: [row], staffNames: { u1: "Maria" }, timeZone: "America/New_York", backHref: "/orders" });
    expect(model.rows).toEqual([{
      key: "e1", title: "ORD-0231 · Ridgeline Taproom", href: "/orders/o1",
      detail: expect.stringMatching(/^Damaged · Hazy IPA · ½ bbl keg −2 · by Maria · .+ · Dropped on the dock$/),
    }]);
  });

  it("names a former team member, and links nowhere without a live backHref", () => {
    const model = toOrderChangesViewProps({ rows: [{ ...row, note: null }], staffNames: {}, timeZone: "UTC" });
    expect(model.rows[0].detail).toMatch(/by a former team member · [^·]+$/);
    expect(model.rows[0].href).toBeUndefined();
  });

  it("names a taproom transfer, which has no customer, as one", () => {
    const model = toOrderChangesViewProps({ rows: [{ ...row, kind: "taproom_transfer", customer_id: null, customer_name: null }], staffNames: {}, timeZone: "UTC" });
    expect(model.rows[0].title).toBe("ORD-0231 · Taproom transfer");
  });

  it("says why it is empty", () => {
    expect(toOrderChangesViewProps({ rows: [], staffNames: {}, timeZone: "UTC" }).empty).toEqual({ title: "No changes after confirm yet" });
    expect(toOrderChangesViewProps({ rows: [], staffNames: {}, timeZone: "UTC", reason: "short" }).empty).toEqual({ title: "No matching changes" });
  });

  it("reads ?reason=, ?staff= and ?customer=, dropping values that are not a code or an id", () => {
    const uuid = "00000000-0000-4000-8000-000000000001";
    const scope = orderChangesScope({ reason: "damaged", staff: "nope", customer: uuid });
    expect([scope.reason, scope.staff, scope.customer]).toEqual(["damaged", undefined, uuid]);
    expect(scope.reasonOptions().map(o => o.label)).toEqual(["All reasons", "Short", "Damaged", "Customer request", "Brewery error", "Other"]);
    expect(scope.staffOptions([{ id: uuid, name: "Maria" }])[1].href).toMatch(/^\/orders\/changes\?.*staff=/);
  });
});

describe("Changes after confirm screen", () => {
  it("the inventory record draws OrderChangesView from the fixture", () => {
    const record = SCREENS.find(s => s.name === "Changes after confirm");
    const body = record?.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(OrderChangesView);
    expect(renderToStaticMarkup(body as never)).toContain("Changes after confirm");
  });
});

describe("reason codes", () => {
  it("adjust_order_lines accepts exactly ORDER_CHANGE_REASONS", () => {
    const source = readFileSync(new URL("../supabase/migrations/20261118180000_order_change_reason_codes.sql", import.meta.url), "utf8");
    const list = source.match(/p_reason_code <> all \(array\[([^\]]+)\]\)/)?.[1];
    expect(list?.split(",").map(code => code.trim().replace(/^'|'$/g, ""))).toEqual([...ORDER_CHANGE_REASONS]);
  });
});

describe("Order detail screen (portal)", () => {
  it("draws a change after confirm", () => {
    const record = SCREENS.find(s => s.portal && s.name === "Order detail");
    expect(renderToStaticMarkup(record?.body as never)).toContain("Changed after confirm: Damaged, Hazy IPA");
  });
});

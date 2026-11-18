// tests/order-changes-view.test.ts — the staff report of changes after confirm
// (Phase C of docs/plans/portal-release-windows.md): rows, filters and empty
// states from list_order_changes, and the inventory record drawing the same view.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SCREENS } from "../components/mgr/screens";
import { OrderChangesView } from "../components/mgr/views/order-changes";
import { orderChangesScope, toOrderChangesViewProps, type OrderChangeRow } from "../lib/mgr/order-changes-view";
import { orderChangesReport } from "../lib/mgr/fixtures/order-changes";

const row: OrderChangeRow = {
  id: "e1", created_at: "2026-09-02T17:15:00.000Z", order_id: "o1", order_no: 231, customer_id: "c1", customer_name: "Ridgeline Taproom",
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
    expect(body.props.model).toEqual(toOrderChangesViewProps(orderChangesReport));
    expect(renderToStaticMarkup(body as never)).toContain("Changes after confirm");
  });
});

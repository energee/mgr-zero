// tests/pick-sheet-view.test.ts — Pick sheet adapter and drawing. Views own
// no sample data; the inventory parent wires this view later.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PickSheetView } from "../components/mgr/views/pick-sheet";
import { pickSheet } from "../lib/mgr/fixtures/pick-sheet";
import { toPickSheetViewProps } from "../lib/mgr/pick-sheet-view";

const html = (model = toPickSheetViewProps(pickSheet), extra?: { filters?: ReactNode; linkRows?: boolean }) =>
  renderToStaticMarkup(createElement(PickSheetView, { model, ...extra }));

describe("Pick sheet view loop", () => {
  it("maps daily_pick_sheet rows onto one ISO date with nav labels and totals", () => {
    const model = toPickSheetViewProps(pickSheet);
    expect(model.empty).toBeUndefined();
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]?.title).toBe("2026-09-03");
    expect(model.groups[0]?.rows.map((r) => r.title)).toEqual([
      "Ridgeline Tap Room · ORD-0231",
      "Al’s Bar · ORD-0232",
      "Teresa’s · ORD-0234",
    ]);
    expect(model.groups[0]?.rows.map((r) => r.detail)).toEqual(["3 lines", "1 line", "5 lines"]);
    expect(model.groups[0]?.rows.map((r) => r.href)).toEqual([
      "/orders/00000000-0000-4000-8000-000000000231",
      "/orders/00000000-0000-4000-8000-000000000232",
      "/orders/00000000-0000-4000-8000-000000000234",
    ]);
    expect(model.groups[0]?.totals).toBe("Hazy IPA · ½ bbl keg 9 · Pils · 16 oz case 22");
  });

  it("names an empty sheet without inventing rows", () => {
    const model = toPickSheetViewProps({ orders: [] });
    expect(model.empty).toBe("Nothing confirmed to pick");
    expect(model.groups).toEqual([]);
  });

  it("groups by requested_ship_date and keeps undated orders under Unscheduled", () => {
    const model = toPickSheetViewProps({
      orders: [
        { ...pickSheet.orders[0]!, requested_ship_date: "2026-09-02" },
        { ...pickSheet.orders[1]!, requested_ship_date: null },
      ],
    });
    expect(model.groups.map((g) => g.title)).toEqual(["2026-09-02", "Unscheduled"]);
    expect(model.groups[0]?.rows).toHaveLength(1);
    expect(model.groups[1]?.rows[0]?.title).toMatch(/^Al’s Bar ·/);
  });

  it("renders Pick sheet, nav labels, and Totals from the adapter", () => {
    const markup = html();
    expect(markup).toMatch(/Pick sheet/);
    expect(markup).toMatch(/Ridgeline Tap Room · ORD-0231/);
    expect(markup).toMatch(/Al’s Bar · ORD-0232/);
    expect(markup).toMatch(/Teresa’s · ORD-0234/);
    expect(markup).toMatch(/3 lines/);
    expect(markup).toMatch(/>Totals</);
    expect(markup).toMatch(/Hazy IPA · ½ bbl keg 9 · Pils · 16 oz case 22/);
    expect(markup).toContain('data-direction="forward"');
    expect(markup).toMatch(/Thu 9\/3/);
  });

  it("hides the weekday chips when filters is null and links rows when asked", () => {
    const markup = html(toPickSheetViewProps(pickSheet), { filters: null, linkRows: true });
    expect(markup).not.toMatch(/Thu 9\/3/);
    expect(markup).toMatch(/href="\/orders\/00000000-0000-4000-8000-000000000231"/);
  });

  it("the Pick sheet inventory record is PickSheetView painted from that fixture", () => {
    const body = SCREENS.find((s) => s.name === "Pick sheet")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Pick sheet")!.body)).toBe(true);
    expect(body.type).toBe(PickSheetView);
    expect(body.props.model).toEqual(toPickSheetViewProps(pickSheet));
  });

  it("the live Pick sheet page mounts PickSheetView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/pick/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/pick-sheet"/);
    expect(src).toMatch(/<PickSheetView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).not.toMatch(/\bE\.(back|row|nav|ttl|blank|chips)\b/);
  });
});

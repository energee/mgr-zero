import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PlanningView } from "../components/mgr/views/planning";
import { planningDemo } from "../lib/mgr/fixtures/planning";
import { toPlanningViewProps, type PlanningViewModel } from "../lib/mgr/planning-view";
import { activeTab, STAFF_NAV } from "../lib/mgr/nav";
import type { StaffRole } from "../lib/commands/registry";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const rows = (model: PlanningViewModel) => model.groups.flatMap((group) => group.rows);
const gap = {
  material_id: "ends", material_name: "Ends", base_uom: "each", purchase_uom: "case",
  required: 10, projected: 0, on_hand: 0, on_order: 0, short: 10, purchase_units_short: 1,
  needed_by: "2026-11-02", vendor_id: "can-co", vendor_name: "Can Co", lead_time_days: 7, buy_by: "2026-10-26", out_of_reach: false,
};

describe("Planning view", () => {
  it("owns the inventory drawing", () => {
    const body = SCREENS.find((screen) => screen.name === "Planning")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(body)).toBe(true);
    expect(body.type).toBe(PlanningView);
    expect(body.props.model).toEqual(toPlanningViewProps(planningDemo));
  });

  it("maps only fields returned by live material requirements", () => {
    const model = toPlanningViewProps({ requirements: [{
      material_id: "ends", material_name: "Ends", base_uom: "each", purchase_uom: "case",
      required: 2832, projected: 0, on_hand: 2400, on_order: 0, short: 432, purchase_units_short: 1,
      needed_by: "2026-09-12", vendor_id: null, vendor_name: null, lead_time_days: null,
      buy_by: null, out_of_reach: false,
    }] });
    expect(rows(model)[0]).toMatchObject({ title: "Ends", quantity: "1 case", warning: true });
    expect(rows(model)[0].detail).not.toContain("projected");
    expect(model.horizon).toBeUndefined();
  });

  it("marks the projected part without splitting or hiding the material gap", () => {
    const model = toPlanningViewProps({ requirements: [{
      material_id: "labels", material_name: "Labels", base_uom: "each", purchase_uom: "roll",
      required: 960, projected: 480, on_hand: 120, on_order: 0, short: 840, purchase_units_short: 2,
      needed_by: "2026-10-30", vendor_id: "vendor", vendor_name: "Label supplier", lead_time_days: 7,
      buy_by: "2026-10-23", out_of_reach: false,
    }] });
    expect(rows(model)).toHaveLength(1);
    expect(rows(model)[0]).toMatchObject({ key: "labels", quantity: "2 roll", warning: false });
    expect(rows(model)[0].detail).toContain("need 960");
    expect(rows(model)[0].detail).toContain("includes 480 projected");
    expect(rows(model)[0].detail).toContain("needed by Oct 30, 2026");
    expect(rows(model)[0].detail).toContain("buy by Oct 23, 2026");
  });

  it("groups gaps by vendor, A to Z, with the rows that have no vendor last (#1516)", () => {
    const model = toPlanningViewProps({ requirements: [
      { ...gap, material_id: "hops", vendor_id: null, vendor_name: null, lead_time_days: null, buy_by: null },
      { ...gap, material_id: "ends" },
      { ...gap, material_id: "labels", vendor_id: "acme", vendor_name: "Acme Labels" },
      { ...gap, material_id: "trays" },
    ] });
    expect(model.groups.map((group) => [group.vendor, group.rows.map((row) => row.key)])).toEqual([
      ["Acme Labels", ["labels"]], ["Can Co", ["ends", "trays"]], [null, ["hops"]],
    ]);
    // The heading names the vendor, so a row does not repeat it.
    expect(model.groups[1].rows[0].detail).not.toContain("Can Co");
    expect(model.groups[1].rows[0].detail).toContain("7 day lead · buy by Oct 26, 2026");
  });

  it("a vendor's purchase order covers its rows still in reach; a vendorless group drafts nothing (#1516)", () => {
    const model = toPlanningViewProps({ requirements: [
      { ...gap, material_id: "ends" }, { ...gap, material_id: "late", out_of_reach: true },
      { ...gap, material_id: "hops", vendor_id: null, vendor_name: null },
    ] });
    expect(model.groups.map((group) => group.draftIds)).toEqual([["ends"], []]);
  });

  it("offers Set vendor only on rows with no vendor, linking Materials for a role that can open it (#1516)", () => {
    const requirements = [{ ...gap }, { ...gap, material_id: "hops", material_name: "Hop bags", vendor_id: null, vendor_name: null }];
    const live = (roles: StaffRole[]) => toPlanningViewProps({ requirements, roles }).groups.flatMap((group) => group.rows.map((row) => row.setVendorHref));
    expect(live(["brewer"])).toEqual([undefined, "/materials?q=Hop%20bags"]);
    expect(live(["sales"])).toEqual([undefined, null]);
    const html = htmlOf(createElement(PlanningView, { model: toPlanningViewProps({ requirements, roles: ["brewer"] }), groupAction: null }));
    expect(html.match(/>Set vendor</g)).toHaveLength(1);
    expect(html).toContain('href="/materials?q=Hop%20bags"');
    expect(html).toMatch(/>Can Co<[\s\S]*Ends[\s\S]*>No vendor<[\s\S]*Hop bags/);
  });

  it("the inventory draws one Create purchase order per vendor group that can draft (#1516)", () => {
    const html = htmlOf(createElement(PlanningView, { model: toPlanningViewProps({ requirements: [{ ...gap }, { ...gap, material_id: "hops", vendor_id: null, vendor_name: null }] }) }));
    expect(html.match(/>Create purchase order</g)).toHaveLength(1);
  });

  it("the live route mounts PlanningView, slots DraftButton, and has no E tree", () => {
    const page = readFileSync("app/(app)/planning/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/planning"/);
    expect(page).toMatch(/<PlanningView\b/);
    expect(page).toMatch(/<DraftButton\b/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("leads a gap whose needed-by date is before the brewery's today with overdue (#993)", () => {
    const row = {
      material_id: "ends", material_name: "Ends", base_uom: "each", purchase_uom: "case",
      required: 10, projected: 0, on_hand: 0, on_order: 0, short: 10, purchase_units_short: 1,
      vendor_id: "vendor", vendor_name: "Can Co", lead_time_days: 7, buy_by: "2026-09-05", out_of_reach: false,
    };
    const model = toPlanningViewProps({ today: "2026-10-08", requirements: [
      { ...row, material_id: "late", needed_by: "2026-10-07" },
      { ...row, material_id: "today", needed_by: "2026-10-08" },
      { ...row, material_id: "undated", needed_by: null },
    ] });
    expect(rows(model).map((r) => [r.key, r.detail.startsWith("overdue · "), r.warning])).toEqual([
      ["late", true, true], ["today", false, false], ["undated", false, false],
    ]);
  });

  it("the live back link returns to the nav group that holds Planning; the inventory fixture leaves it inert (#1142)", () => {
    const parent = activeTab(STAFF_NAV, "/planning")!.href;
    expect(readFileSync("app/(app)/planning/page.tsx", "utf8")).toContain(`backHref: "${parent}"`);
    const html = htmlOf(createElement(PlanningView, { model: toPlanningViewProps({ requirements: [], backHref: parent, roles: ["brewer"] }) }));
    expect(html).toMatch(new RegExp(`<a[^>]*href="${parent}"[^>]*>.*?More</a>`));
    expect(toPlanningViewProps(planningDemo).backHref).toBeUndefined();
  });

  it("an empty shortage list says it is shortage-only and links, inside the empty block, to where demand is set up (#1142)", () => {
    const { empty } = toPlanningViewProps({ requirements: [], roles: ["brewer"] });
    expect(empty?.title).toBe("No material shortages");
    expect(empty?.description).toContain("planned or brewing batches");
    expect(empty?.description).toContain("does not mean any work is scheduled");
    expect(empty?.description).not.toMatch(/every committed|is covered/);
    expect(empty?.links).toEqual([
      expect.objectContaining({ title: "Batches", href: "/batches" }),
      expect.objectContaining({ title: "Packaging", href: "/packaging" }),
      expect.objectContaining({ title: "Materials", href: "/materials" }),
    ]);
    const html = htmlOf(createElement(PlanningView, { model: toPlanningViewProps({ requirements: [], roles: ["brewer"] }) }));
    expect(html).toContain("No material shortages");
    expect(html).toMatch(/data-slot="empty-content"[\s\S]*href="\/batches"[\s\S]*href="\/packaging"[\s\S]*href="\/materials"/);
    expect(toPlanningViewProps(planningDemo).empty).toBeUndefined();
  });

  it("rows that are not short still leave the empty state (#1142)", () => {
    const covered = {
      material_id: "malt", material_name: "Malt", base_uom: "lb", purchase_uom: "bag",
      required: 100, projected: 0, on_hand: 100, on_order: 0, short: 0, purchase_units_short: 0,
      needed_by: null, vendor_id: "vendor", vendor_name: "Malt Co", lead_time_days: 7, buy_by: null, out_of_reach: false,
    };
    const model = toPlanningViewProps({ requirements: [covered] });
    expect(model.groups).toEqual([]);
    expect(model.empty?.title).toBe("No material shortages");
  });

  it("the empty state links only pages the viewer's roles can open (#1142)", () => {
    const hrefs = (roles: StaffRole[]) => toPlanningViewProps({ requirements: [], roles }).empty?.links.map((link) => link.href);
    expect(hrefs(["brewer"])).toEqual(["/batches", "/packaging", "/materials"]);
    expect(hrefs(["warehouse"])).toEqual(["/packaging", "/materials"]);
    expect(readFileSync("app/(app)/planning/page.tsx", "utf8")).toContain("roles: brewery.roles");
  });

  it("the inventory draws every empty-state link row, inert (#1142)", () => {
    expect(toPlanningViewProps({ requirements: [] }).empty?.links).toEqual([
      { title: "Batches", detail: expect.any(String) },
      { title: "Packaging", detail: expect.any(String) },
      { title: "Materials", detail: expect.any(String) },
    ]);
  });

  it("the inventory draws an overdue gap through the adapter, so the marker has a frame (#1037)", () => {
    const overdue = rows(toPlanningViewProps(planningDemo)).filter((r) => r.detail.startsWith("overdue · "));
    expect(overdue).toHaveLength(1);
    expect(overdue[0].warning).toBe(true);
  });
});


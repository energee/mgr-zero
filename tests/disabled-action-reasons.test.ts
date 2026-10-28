import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BrandView } from "../components/mgr/views/brand";
import { IngredientView } from "../components/mgr/views/ingredient";
import { QboConnectionView, QboDefaultsView, QboSyncView } from "../components/mgr/views/accounting";
import { RecipeView } from "../components/mgr/views/recipe";
import { toBrandViewProps } from "../lib/mgr/brand-view";
import type { IngredientFields } from "../components/mgr/views/ingredient";
import { ingredientReason, lineReady, timingOutOfRange, toIngredientFields } from "../lib/mgr/recipe-process-view";
import { ShipForm, type ShippingSnapshot } from "../app/(app)/orders/[id]/ship-form";
import { BrewTimelineView } from "../components/mgr/views/brew-timeline";
import { BrewPrepView } from "../components/mgr/views/brew-prep";
import { PackagingCloseFields } from "../components/mgr/views/close-packaging-run";
import { PackagingSourcePicker, PlanActions } from "../components/mgr/views/plan-actions";
import { CycleCountView } from "../components/mgr/views/cycle-count";
import { CellarMapView } from "../components/mgr/views/cellar-map";
import { InviteView } from "../components/mgr/views/team-controls";
import { brewPrepMineral, brewTimelineMineral } from "../lib/mgr/fixtures/production";
import { cycleCountCans, receivePoCountryMalt } from "../lib/mgr/fixtures/purchasing";
import { ReceivePoView } from "../components/mgr/views/receive-po";
import { toCellarMapViewProps } from "../lib/mgr/cellar-map-view";

// ShipForm renders without a router or a command round trip.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/commands/use-command-form", () => ({
  useCommandAction: () => ({ busy: false, error: null, fieldErrors: {}, run: () => {} }),
}));

function describedButton(html: string, label: string, reason?: RegExp) {
  const button = html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];
  expect(button).toContain('disabled=""');
  const reasonId = button?.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(reasonId).toBeTruthy();
  const description = html.match(new RegExp(`<p id="${reasonId}"[^>]*>([^<]+)</p>`))?.[1];
  if (reason) expect(description).toMatch(reason);
  return description;
}

describe("remaining named disabled-action reasons (#1122)", () => {
  const brand = (name: string) => renderToStaticMarkup(createElement(BrandView, {
    model: toBrandViewProps({ brand: { id: "", name, abv: null, description: null, category: null, hops: null, price_group_id: null, styles: null, skus: [] }, styles: [], priceGroups: [] }),
  }));
  it("explains a blank or whitespace brand name and clears when named", () => {
    for (const name of ["", "   "]) describedButton(brand(name), "Save brand", /brand name/i);
    expect(brand("New beer")).not.toContain("Still needed:");
    expect(brand("New beer").match(/<button[^>]*>Save brand<\/button>/)?.[0]).not.toContain('disabled=""');
  });

  const ingredient = (patch: Partial<IngredientFields> = {}) => renderToStaticMarkup(createElement(IngredientView, {
    fields: { materialId: "", stage: "mash", perBblQty: "", timing: "", ...patch },
    materials: [{ id: "malt", name: "Malt", unit: "lb" }],
  }));
  it("names missing ingredient inputs and preserves the existing timing requirement", () => {
    describedButton(ingredient(), "Save ingredient", /material.*quantity/i);
    describedButton(ingredient({ materialId: "malt" }), "Save ingredient", /quantity.*above zero/i);
    describedButton(ingredient({ materialId: "malt", perBblQty: "1", timing: "1.5" }), "Save ingredient", /mash timing from 0 to 1440 minutes/i);
    const ready = ingredient({ materialId: "malt", perBblQty: "1" });
    expect(ready).not.toContain("Still needed:");
    expect(ready.match(/<button[^>]*>Save ingredient<\/button>/)?.[0]).not.toContain('disabled=""');
  });

  it("keeps ingredient eligibility identical to lineReady plus the stage's timing range (#1478)", () => {
    const limits = { fermentationDays: 0 };
    for (const materialId of ["", "malt"]) {
      for (const perBblQty of ["", "-1", "0", "1", "NaN", "Infinity"]) {
        for (const timingMinutes of ["", "0", "-1", "1.5", "NaN"]) {
          const line = { materialId, perBblQty, timingMinutes, stage: "mash" as const };
          const fields: IngredientFields = toIngredientFields(line);
          expect(ingredientReason(fields, limits) === null).toBe(lineReady(line) && !timingOutOfRange(line.stage, fields.timing, limits));
        }
      }
    }
  });

  it("keeps Create recipe's existing adjacent blocker reactive", () => {
    const render = (blockedReason?: string) => renderToStaticMarkup(createElement(RecipeView, {
      model: { title: "New recipe", notes: "" },
      controls: { set: () => {}, onSubmit: () => {}, submitLabel: "Create recipe", blockedReason },
    }));
    expect(render("Add a mash step.")).toContain("Add a mash step.");
    expect(render("Add a mash step.").match(/<button[^>]*>Create recipe<\/button>/)?.[0]).toContain('disabled=""');
    expect(render()).not.toContain("Add a mash step.");
  });

  it("explains integration setup, rather than suggesting missing form input", () => {
    const connect = renderToStaticMarkup(createElement(QboConnectionView, { configured: false }));
    describedButton(connect, "Connect QuickBooks", /QuickBooks.*not|isn’t turned on/i);
    expect(connect).not.toContain("Still needed:");
    const sync = renderToStaticMarkup(createElement(QboSyncView, { disabled: true }));
    describedButton(sync, "Sync QuickBooks", /connect.*QuickBooks.*sync/i);
    expect(renderToStaticMarkup(createElement(QboSyncView))).not.toContain("before syncing payments");
    const defaults = renderToStaticMarkup(createElement(QboDefaultsView, { allowAch: false, allowCard: false, disabled: true }));
    describedButton(defaults, "Save push defaults", /connect.*QuickBooks.*saving/i);
  });

  it("labels pending work as loading, not missing setup", () => {
    const html = renderToStaticMarkup(createElement(QboSyncView, { busy: true }));
    expect(html).toContain("Syncing…");
    expect(html).not.toContain("before syncing payments");
    expect(html).not.toContain("Still needed:");
  });
});

describe("Oct 25 recheck: withheld actions say why (#1122)", () => {
  const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement("div", null, node));

  it("Ship order names the line still without a source", () => {
    const skuName = "Hazy IPA case";
    const snapshot = {
      order: { id: "o", order_no: 7, kind: "wholesale", from_location_id: "w", to_location_id: null },
      lines: [{ id: "a", sku_id: "sku-a", qty_ordered: 3, qty_picked: 3, qty_shipped: null, skus: { name: skuName } }],
      locations: [{ id: "w", name: "Warehouse" }],
    } as ShippingSnapshot;
    const reason = describedButton(html(createElement(ShipForm, { snapshot, available: { bins: [], destinationBins: [], stock: [] } })), "Ship order");
    expect(reason).toContain(skuName);
  });

  it("Complete transfer carries the same reason", () => {
    const skuName = "Pils keg";
    const snapshot = {
      order: { id: "o", order_no: 8, kind: "taproom_transfer", from_location_id: "w", to_location_id: "t" },
      lines: [{ id: "a", sku_id: "sku-a", qty_ordered: 3, qty_picked: 3, qty_shipped: null, skus: { name: skuName } }],
      locations: [{ id: "w", name: "Warehouse" }, { id: "t", name: "Taproom" }],
    } as ShippingSnapshot;
    const reason = describedButton(html(createElement(ShipForm, { snapshot, available: { bins: [], destinationBins: [], stock: [] } })), "Complete transfer");
    expect(reason).toContain(skuName);
  });

  it("Record brew day names what is still open, even after every row is confirmed", () => {
    const confirmed = { ...brewTimelineMineral, ingredients: brewTimelineMineral.ingredients.map(row => ({ ...row, confirmed: true })) };
    describedButton(html(createElement(BrewTimelineView, { model: confirmed })), "Record brew day", /^Still needed: a source for Chit Malt\.$/);
  });

  it("Done pulling names the ingredient without a source", () => {
    describedButton(html(createElement(BrewPrepView, { model: brewPrepMineral })), "Done pulling", /^Still needed: a source for Chit Malt\.$/);
  });

  it("Choose lot with no stock says so in a plain sentence, not a Still needed line", () => {
    describedButton(html(createElement(BrewPrepView, { model: { ...brewPrepMineral, sources: [] } })), "Choose lot", /^No Chit Malt in stock to choose from\.$/);
  });

  it("Close packaging run lists lot code, location and bin", () => {
    const model = { bblDrawn: "3", outputs: [], lotCode: "", packagedOn: "2026-10-25", bestBy: "", locationId: "", binId: "", locations: [], bins: [], plan: { revision: "r", planned: [], sources: [], materials: [], lots: [] }, actuals: [] };
    describedButton(html(createElement(PackagingCloseFields, { model })), "Close packaging run", /^Still needed: a lot code, a finished goods location, and a finished goods bin\.$/);
  });

  it("Reschedule and Pick source say what they wait for", () => {
    describedButton(html(createElement(PlanActions, { plannedOn: "2026-10-22" })), "Reschedule", /^Still needed: a different planned date\.$/);
    describedButton(html(createElement(PackagingSourcePicker, { occupancies: [] })), "Pick source", /^Still needed: a source tank\.$/);
  });

  it("Preview count names the missing count", () => {
    describedButton(html(createElement(CycleCountView, { model: cycleCountCans, footer: null, previewReason: "Still needed: a counted quantity of zero or more." })), "Preview count", /counted quantity/);
  });

  it("Cancel purchase order waits for a closure reason that is not blank", () => {
    for (const closureReason of ["", "   "]) {
      describedButton(html(createElement(ReceivePoView, { model: { ...receivePoCountryMalt, closureReason } })), "Cancel purchase order", /^Still needed: a closure reason\.$/);
    }
    const ready = html(createElement(ReceivePoView, { model: receivePoCountryMalt })).match(/<button[^>]*>Cancel purchase order<\/button>/)?.[0];
    expect(ready).toBeTruthy();
    expect(ready).not.toContain('disabled=""');
  });

  it("the cellar with no vessels still says why Reading, Transfer and Addition are off", () => {
    const model = toCellarMapViewProps([], []);
    expect(html(createElement(CellarMapView, { model }))).toContain("No tank holds beer");
  });

  it("Send invite is withheld, with its reason, until the email is valid (#1488)", () => {
    const page = html(createElement(InviteView, { buyer: false }));
    expect(page.match(/<button[^>]*>Send invite<\/button>/)?.[0]).toContain('disabled=""');
    expect(page).toContain("Still needed: a valid email address.");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandView } from "../components/mgr/views/brand";
import { IngredientView } from "../components/mgr/views/ingredient";
import { QboConnectionView, QboDefaultsView, QboSyncView } from "../components/mgr/views/accounting";
import { RecipeView } from "../components/mgr/views/recipe";
import { toBrandViewProps } from "../lib/mgr/brand-view";
import type { IngredientFields } from "../components/mgr/views/ingredient";
import { ingredientReason, lineReady } from "../lib/mgr/recipe-process-view";

function describedButton(html: string, label: string, reason: RegExp) {
  const button = html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];
  expect(button).toContain('disabled=""');
  const reasonId = button?.match(/aria-describedby="([^"]+)"/)?.[1];
  expect(reasonId).toBeTruthy();
  const description = html.match(new RegExp(`<p id="${reasonId}"[^>]*>([^<]+)</p>`))?.[1];
  expect(description).toMatch(reason);
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
    fields: { materialId: "", stage: "mash", perBblQty: "", timingMinutes: "", ...patch },
    materials: [{ id: "malt", name: "Malt", unit: "lb" }],
  }));
  it("names missing ingredient inputs and preserves the existing timing requirement", () => {
    describedButton(ingredient(), "Save ingredient", /material.*quantity/i);
    describedButton(ingredient({ materialId: "malt" }), "Save ingredient", /quantity.*above zero/i);
    describedButton(ingredient({ materialId: "malt", perBblQty: "1", timingMinutes: "1.5" }), "Save ingredient", /timing.*whole minutes/i);
    const ready = ingredient({ materialId: "malt", perBblQty: "1" });
    expect(ready).not.toContain("Still needed:");
    expect(ready.match(/<button[^>]*>Save ingredient<\/button>/)?.[0]).not.toContain('disabled=""');
  });

  it("keeps ingredient eligibility identical to lineReady, including optional timing", () => {
    for (const materialId of ["", "malt"]) {
      for (const perBblQty of ["", "-1", "0", "1", "NaN", "Infinity"]) {
        for (const timingMinutes of ["", "0", "-1", "1.5", "NaN"]) {
          const fields: IngredientFields = { materialId, perBblQty, timingMinutes, stage: "mash" };
          expect(ingredientReason(fields) === null).toBe(lineReady(fields));
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

// tests/settings-view.test.ts — the Settings brewery form's books-opened field
// (docs/plans/lolev-history.md task 4): the form saves it through its own
// command, and only when it changed, so a refused date never blocks the rest.
// The one-way keg fee field saves the same way (docs/plans/lolev-orders.md task 6).
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { booksOpenedChange, oneWayKegFeeChange, toBrewerySettingsValues, breweryOperatingDefaultsCommand } from "@/lib/mgr/settings-view";
import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { SettingsView } from "@/components/mgr/views/settings";
import { settingsDemo } from "@/lib/mgr/fixtures/settings";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/settings";

const action = vi.hoisted(() => ({ busy: false, error: null, run: vi.fn() }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));

const brewery = {
  name: settingsDemo.name, timezone: settingsDemo.timezone, ttb_registry_no: settingsDemo.ttb,
  pa_license_no: settingsDemo.paLicense, customer_phone: settingsDemo.phone,
  fermentation_reading_due_hours: 24, days_to_package: 14, books_opened_on: null, one_way_keg_fee_cents: 1000,
};

type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function elements(node: ReactNode): Node[] {
  if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

describe("packaging operating defaults", () => {
  it("reads persisted days and uses the same values in the inventory and live form", () => {
    const live = SettingsForm({ brewery });
    expect(live.type).toBe(BrewerySettingsFormView);
    expect(live.props.initial).toEqual(toBrewerySettingsValues(brewery));
    expect(toBrewerySettingsValues({ ...brewery, days_to_package: 28 }).daysToPackage).toBe("28");
    const inventory = SettingsView({ model: settingsDemo });
    const fixtureForm = elements(inventory).find(node => node.type === BrewerySettingsFormView)!;
    expect(fixtureForm.props.initial).toEqual(live.props.initial);
    const html = renderToStaticMarkup(inventory);
    expect(html).toContain('aria-label="Days to package"');
    const formHtml = renderToStaticMarkup(createElement(BrewerySettingsFormView, { initial: live.props.initial }));
    expect(formHtml).toContain('aria-label="Days to package"');
    expect(formHtml).toContain('min="1"');
    expect(formHtml).toContain('max="120"');
    expect(formHtml).toContain('step="1"');
  });

  it("saves days alongside reading hours through the existing operating-defaults command", () => {
    action.run.mockReset();
    action.run.mockImplementation((name, input, saved) => {
      expect(getCommandDefinition(name)?.input.safeParse(input).success).toBe(true);
      saved?.();
    });
    const live = SettingsForm({ brewery });
    live.props.onSave({ ...live.props.initial, hours: "48", daysToPackage: "28" });
    expect(action.run).toHaveBeenNthCalledWith(1, "update_brewery", expect.not.objectContaining({ daysToPackage: expect.anything() }), expect.any(Function));
    expect(action.run).toHaveBeenNthCalledWith(1, "update_brewery", expect.objectContaining({ readingDueHours: 48 }), expect.any(Function));
    expect(action.run).toHaveBeenNthCalledWith(2, "set_brewery_operating_defaults", { readingDueHours: 48, daysToPackage: 28 }, expect.any(Function));
    expect(action.run).toHaveBeenCalledTimes(2);
  });

  it("requires whole days from 1 through 120", () => {
    const values = toBrewerySettingsValues(brewery);
    expect(breweryOperatingDefaultsCommand({ ...values, daysToPackage: "120" })).toEqual({
      name: "set_brewery_operating_defaults", input: { readingDueHours: 24, daysToPackage: 120 }, valid: true,
    });
    for (const daysToPackage of ["", "0", "121", "1.5", "invalid"]) {
      expect(breweryOperatingDefaultsCommand({ ...values, daysToPackage }).valid).toBe(false);
    }
  });

  it("prevents the shared form's invalid defaults from reaching onSave", () => {
    const onSave = vi.fn();
    let form: ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => void }> | undefined;
    function Capture() {
      const node = BrewerySettingsFormView({ initial: { ...toBrewerySettingsValues(brewery), daysToPackage: "0" }, onSave });
      form = node;
      return node;
    }
    const html = renderToStaticMarkup(createElement(Capture));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save brewery/);
    const preventDefault = vi.fn();
    form!.props.onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("booksOpenedChange", () => {
  it("is nothing when the date did not change", () => {
    expect(booksOpenedChange("2026-10-01", "2026-10-01")).toBeUndefined();
    expect(booksOpenedChange("", "")).toBeUndefined();
  });

  it("sends the new date", () => {
    expect(booksOpenedChange("", "2026-10-01")).toEqual({ booksOpenedOn: "2026-10-01" });
    expect(booksOpenedChange("2026-09-01", "2026-10-01")).toEqual({ booksOpenedOn: "2026-10-01" });
  });

  it("sends null when the field is cleared", () => {
    expect(booksOpenedChange("2026-10-01", "")).toEqual({ booksOpenedOn: null });
  });
});

describe("oneWayKegFeeChange", () => {
  it("is nothing when the fee did not change", () => {
    expect(oneWayKegFeeChange(1000, "10.00")).toBeUndefined();
    expect(oneWayKegFeeChange(0, "")).toBeUndefined();
  });

  it("sends the new fee in cents, and a cleared field as no fee", () => {
    expect(oneWayKegFeeChange(1000, "12.50")).toEqual({ feeCents: 1250 });
    expect(oneWayKegFeeChange(1000, "")).toEqual({ feeCents: 0 });
  });
});

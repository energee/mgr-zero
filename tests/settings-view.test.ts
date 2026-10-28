// tests/settings-view.test.ts — the Settings brewery form's books-opened field
// (docs/plans/lolev-history.md task 4): the form saves it through its own
// command, and only when it changed, so a refused date never blocks the rest.
// The one-way keg fee field saves the same way (docs/plans/lolev-orders.md task 6).
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { booksOpenedChange, oneWayKegFeeChange, oneWayKegFeeError, toBrewerySettingsValues, breweryOperatingDefaultsCommand, brewerySettingsReason, refreshBrewerySettingsValues } from "@/lib/mgr/settings-view";
import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { E } from "@/components/mgr/e";
import { SettingsView } from "@/components/mgr/views/settings";
import { PortalFulfillmentView } from "@/components/mgr/views/portal-fulfillment";
import { settingsDemo } from "@/lib/mgr/fixtures/settings";
import { SettingsForm } from "@/app/(app)/settings/settings-form";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/settings";

const action = vi.hoisted(() => ({ busy: false, error: null, fieldErrors: {}, run: vi.fn() }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));

const brewery = {
  name: settingsDemo.name, timezone: settingsDemo.timezone, ttb_registry_no: settingsDemo.ttb,
  pa_license_no: settingsDemo.paLicense, customer_phone: settingsDemo.phone,
  fermentation_reading_due_hours: 24, days_to_package: 14, books_opened_on: null, one_way_keg_fee_cents: 1000,
};

describe("Settings save readiness (#1316)", () => {
  const initial = toBrewerySettingsValues(brewery);

  it("requires an actual change and returns to pristine after reverting", () => {
    expect(brewerySettingsReason(initial, initial)).toBe("Still needed: a change to brewery details.");
    expect(brewerySettingsReason({ ...initial, name: "New brewery" }, initial)).toBeNull();
    expect(brewerySettingsReason({ ...initial, name: ` ${initial.name} `, hours: "024" }, initial)).toContain("a change");
    expect(brewerySettingsReason({ ...initial }, initial)).toContain("a change");
  });

  it("names missing details and the actual numeric ranges", () => {
    expect(brewerySettingsReason({ ...initial, name: "   " }, initial)).toContain("a brewery name");
    expect(brewerySettingsReason({ ...initial, timezone: "" }, initial)).toContain("a timezone");
    for (const hours of ["", "0", "169", "1.5"]) {
      expect(brewerySettingsReason({ ...initial, hours }, initial)).toContain("reading overdue hours from 1 to 168 (whole numbers)");
    }
    for (const daysToPackage of ["", "0", "121", "500", "1.5"]) {
      expect(brewerySettingsReason({ ...initial, daysToPackage }, initial)).toContain("days to package from 1 to 120 (whole numbers)");
    }
    for (const daysToPackage of ["1", "120"]) {
      expect(brewerySettingsReason({ ...initial, daysToPackage }, initial)).toBeNull();
    }
  });

  it("refreshes untouched fields without dropping unsaved or uncertain edits", () => {
    const values = { ...initial, name: "Unsaved brewery" };
    const refreshed = { ...initial, hours: "48" };
    expect(refreshBrewerySettingsValues(initial, values, refreshed)).toEqual({ ...refreshed, name: values.name });
    const saved = { ...refreshed, name: values.name };
    expect(brewerySettingsReason(refreshBrewerySettingsValues(refreshed, values, saved), saved)).toBeNull();
  });

  it("withholds pristine submits in the shared inventory and names the reason", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { model: settingsDemo }));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save brewery/);
    expect(html).toContain("Still needed: a change to brewery details.");
  });

  it("links Units and Sale channels from People and places", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, {
      model: settingsDemo, hrefs: { units: "/settings/units", channels: "/settings/channels" },
    }));
    const people = html.match(/<section aria-labelledby="settings-people"[\s\S]*?<\/section>/)?.[0];
    expect(people).toMatch(/<a[^>]*href="\/settings\/units"[^>]*>[\s\S]*?Units/);
    expect(people).toMatch(/<a[^>]*href="\/settings\/channels"[^>]*>[\s\S]*?Sale channels/);
  });

  it("blocks pristine and pending brewery saves at the live adapter", () => {
    action.run.mockReset();
    const live = SettingsForm({ brewery });
    live.props.onSave(live.props.initial);
    expect(action.run).not.toHaveBeenCalled();
    action.busy = true;
    const pending = SettingsForm({ brewery });
    pending.props.onSave({ ...pending.props.initial, name: "Changed" });
    expect(action.run).not.toHaveBeenCalled();
    action.busy = false;
  });
});


describe("packaging operating defaults", () => {

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

describe("one-way fee readiness before sequential settings writes", () => {
  it.each(["1.234", "-1", "1e2", "21474836.48"])("blocks invalid fee %s before any settings command", oneWayKegFee => {
    action.run.mockReset();
    const live = SettingsForm({ brewery });
    live.props.onSave({ ...live.props.initial, name: "Changed brewery", oneWayKegFee });
    expect(action.run).not.toHaveBeenCalled();
  });
  it.each(["1.234", "-1", "1e2", "1E2", "Infinity", "NaN", "0x10", "21474836.48"])("refuses %s without silently rounding or converting notation", value => {
    expect(oneWayKegFeeError(value)).toEqual(expect.any(String));
  });
  it.each(["", "0", "0.00", "1.23", "1.2300", ".50", "21474836.47"])("accepts the existing whole-cent value %s", value => {
    expect(oneWayKegFeeError(value)).toBeUndefined();
  });
});

describe("Settings sections (#1025)", () => {
  const html = renderToStaticMarkup(createElement(SettingsView, { model: settingsDemo }));
  const forms = html.split("<form").slice(1).map((chunk) => chunk.slice(0, chunk.indexOf("</form>")));

  it("keeps Brewery details its own form; the AI model and warehouse pickers save on select (#1509)", () => {
    const own = forms.filter((form) => form.includes("Brewery details"));
    expect(own).toHaveLength(1);
    expect(own[0].match(/type="submit"/g)).toHaveLength(1);
    expect(own[0]).toContain("Save brewery");
    for (const legend of ["Ask MGR", "Wholesale fulfillment"]) expect(forms.some((form) => form.includes(legend)), legend).toBe(false);
    for (const field of ["AI model", "Portal fulfillment warehouse"]) expect(html, field).toContain(field);
  });

  it("explains missing versus zero on the one-way fee and the reading hours", () => {
    const brewery = forms.find((form) => form.includes("Brewery details"))!;
    for (const [field, help] of [["oneWayKegFee", /blank.*no fee|no fee.*blank/i], ["hours", /required.*1 to 168|1 to 168.*cannot be blank/i]] as const) {
      const id = new RegExp(`id="([^"]*-${field})"`).exec(brewery)?.[1];
      expect(id, field).toBeDefined();
      const described = new RegExp(`id="${id}"[^>]*aria-describedby="([^"]+)"|aria-describedby="([^"]+)"[^>]*id="${id}"`).exec(brewery);
      const helpId = described?.[1] ?? described?.[2];
      expect(helpId, field).toBeDefined();
      expect(new RegExp(`id="${helpId}"[^>]*>([^<]*)<`).exec(brewery)?.[1], field).toMatch(help);
    }
  });
});

describe("Settings follow-up polish (#1147)", () => {
  it("preserves the owner's read-only Deployment footer", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { model: settingsDemo }));
    expect(html).toContain("Deployment");
    expect(html).toContain(settingsDemo.deployment);
  });
});

describe("Wholesale fulfillment with no warehouse (#1147)", () => {
  const view = (props: { locations?: { id: string; name: string }[]; currentId?: string | null; locationsHref?: string; busy?: boolean; onSave?: (id: string) => Promise<boolean> } = {}) =>
    renderToStaticMarkup(createElement(PortalFulfillmentView, { locations: [], currentId: null, ...props }));
  const text = (html: string) => html.replace(/<[^>]*>/g, "").replaceAll("&#x27;", "'");

  it("names the Uses field and links Edit locations under the disabled picker", () => {
    const html = view({ locationsHref: "/locations" });
    expect(text(html)).toContain("No location has Warehouse in its Uses. Add Warehouse to a location's Uses, then choose it here.");
    const link = /<a([^>]*)>Edit locations<\/a>/.exec(html)?.[1];
    expect(link).toContain('href="/locations"');
    expect(link).toContain('data-to="Locations"');
    expect(/<button[^>]*id="portal-warehouse"[^>]*>/.exec(html)?.[0]).toMatch(/aria-describedby="portal-warehouse-empty"/);
  });

  it("sends nothing while a save is pending or when the saved warehouse is picked again (#1509)", () => {
    const pick = vi.spyOn(E, "pick");
    try {
      for (const busy of [false, true]) {
        const onSave = vi.fn(async () => true);
        view({ locations: settingsDemo.warehouseOptions, currentId: settingsDemo.warehouseId, busy, onSave });
        pick.mock.calls.at(-1)![3]!.onChange!(settingsDemo.warehouseId!);
        expect(onSave).not.toHaveBeenCalled();
      }
    } finally { pick.mockRestore(); }
  });

  it("starts unchosen when the saved location no longer has the Warehouse use", () => {
    const html = view({ currentId: settingsDemo.warehouseId });
    expect(html).toContain("Choose warehouse");
    expect(html).not.toContain("Save warehouse");
  });

  it("leaves Settings one Locations row: People and places", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { model: { ...settingsDemo, warehouseId: null, warehouseOptions: [] } }));
    expect(html.match(/>Locations</g)).toHaveLength(1);
    expect(html).toContain("Edit locations");
  });
});

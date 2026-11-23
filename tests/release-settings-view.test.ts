// tests/release-settings-view.test.ts — the Releases section of Settings
// (docs/plans/release-pool-and-ceilings.md): the brewery's release defaults as
// form text, the set_release_defaults payload and why Save is withheld, and how
// a customer's limit reads.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseSettingsFormView } from "../components/mgr/views/release-settings-form";
import { releaseDefaultsCommand, releaseShareLine, toReleaseSettingsValues } from "../lib/mgr/release-settings-view";
import { settingsDemo } from "../lib/mgr/fixtures/settings";

const brewery = { release_open_pct: 75, release_order_by_days: 7, release_cap_lift_days: 14, release_digest_dow: null, release_share_window_days: null, release_stock_multiplier: 2, release_max_share_pct: 50 };
const initial = toReleaseSettingsValues(brewery);

describe("release settings", () => {
  it("reads the brewery's defaults as text, with the digest and calculated limits off when unset", () => {
    expect(initial).toEqual({ openPct: "75", orderByDays: "7", capLiftDays: "14", digestDay: "", shareWindowDays: "", stockMultiplier: "2", maxSharePct: "50" });
    expect(toReleaseSettingsValues({ ...brewery, release_digest_dow: 1, release_share_window_days: 90 })).toMatchObject({ digestDay: "1", shareWindowDays: "90" });
  });

  it("builds set_release_defaults, sending null for an off digest and no history window", () => {
    const command = releaseDefaultsCommand({ ...initial, openPct: "80", digestDay: "1", shareWindowDays: "90", stockMultiplier: "1.5" }, initial);
    expect(command).toEqual({
      name: "set_release_defaults", reason: null,
      input: { openPct: 80, orderByDays: 7, capLiftDays: 14, shareWindowDays: 90, stockMultiplier: 1.5, maxSharePct: 50, digestDay: 1 },
    });
    expect(releaseDefaultsCommand({ ...initial, openPct: "80" }, initial).input).toMatchObject({ shareWindowDays: null, digestDay: null });
  });

  it("withholds Save until something changed and every field is in range", () => {
    expect(releaseDefaultsCommand(initial, initial).reason).toMatch(/a change to the release settings/);
    expect(releaseDefaultsCommand({ ...initial, openPct: "0" }, initial).reason).toMatch(/percent open from 1 to 100/);
    expect(releaseDefaultsCommand({ ...initial, capLiftDays: "91" }, initial).reason).toMatch(/limit days from 0 to 90/);
    expect(releaseDefaultsCommand({ ...initial, shareWindowDays: "3" }, initial).reason).toMatch(/history window from 7 to 730 days, or blank/);
    expect(releaseDefaultsCommand({ ...initial, stockMultiplier: "0.5" }, initial).reason).toMatch(/stock multiplier from 1 to 10/);
  });

  it("says where a customer's limit comes from", () => {
    expect(releaseShareLine({ manual_pct: null, base_pct: 15, pct: 18 })).toBe("18% · 15% from purchases, +3% from stock");
    expect(releaseShareLine({ manual_pct: 25, base_pct: 31, pct: 25 })).toBe("25% · set on the customer");
    expect(releaseShareLine({ manual_pct: null, base_pct: 0.9, pct: 5 })).toBe("5% · the minimum (0.9% of purchases)");
    // Held to the maximum, or outweighed by others' stock purchases.
    expect(releaseShareLine({ manual_pct: null, base_pct: 62, pct: 50 })).toBe("50% · 62% of purchases before stock is weighed");
    expect(releaseShareLine({ manual_pct: null, base_pct: null, pct: null })).toBe("No limit");
  });

  it("draws the section with its fields, the digest day and each customer's limit", () => {
    const html = renderToStaticMarkup(createElement(ReleaseSettingsFormView, { initial: settingsDemo.releases!, shares: settingsDemo.releaseShares }));
    for (const label of ["Releases", "Open to wholesale (%)", "Ordering closes (days before ship)", "Customer limits lift (days before ship)", "Weekly digest", "Calculate limits from purchases (days)", "Save releases", "Customer limits"]) expect(html).toContain(label);
    expect(html).toContain("18% · 15% from purchases, +3% from stock");
    expect(html).toContain("No limit");
  });
});

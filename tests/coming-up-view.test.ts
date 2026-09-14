// tests/coming-up-view.test.ts — portal_schedule rows → Coming up view-model (issue #278).
import { describe, expect, it } from "vitest";
import { brandAnchor, toComingUpViewProps } from "@/lib/mgr/coming-up-view";

const rows = [
  { brand_id: "b1", brand_name: "Hazy IPA", planned_week: "2026-09-14" },
  { brand_id: "b2", brand_name: "Saison", planned_week: "2026-10-05" },
];

describe("toComingUpViewProps", () => {
  it("one row per brand and week, flagging a brand with nothing listed", () => {
    const m = toComingUpViewProps({ brewery: "Demo Brewing", rows, listed: new Set(["Hazy IPA"]) });
    expect(m.rows).toEqual([
      { key: "b1-2026-09-14", title: "Hazy IPA", detail: "week of Sep 14", warning: false, href: "/portal#brand-hazy-ipa" },
      { key: "b2-2026-10-05", title: "Saison", detail: "week of Oct 5 · not yet listed", warning: true, href: "/portal#brand-saison" },
    ]);
    expect(m.info).toBe("Dates are the brewery’s plan and can move. Ask Demo Brewing to be notified when a batch is packaged.");
    expect(m.empty).toBeUndefined();
  });
  it("nothing planned is the empty state", () => {
    expect(toComingUpViewProps({ brewery: "Demo Brewing", rows: [], listed: new Set() }).empty?.title).toBe("Nothing planned yet");
  });
  it("anchors match between Shop headings and rows", () => {
    expect(brandAnchor("Hazy IPA · 2026")).toBe("brand-hazy-ipa-2026");
  });
});

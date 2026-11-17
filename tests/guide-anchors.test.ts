// tests/guide-anchors.test.ts — the per-page "?" map (#1741): every anchor it
// names is a heading in the guide it points at, and every top-level page has
// an entry, so a new page cannot ship without help.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIDE_ANCHORS, guideHrefFor } from "@/lib/mgr/guide-anchors";

const dirs = (path: string) =>
  readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("[")).map((d) => d.name);

describe("guide anchors", () => {
  it("names only headings that exist in the guide", () => {
    for (const href of Object.values(GUIDE_ANCHORS)) {
      const [guide, anchor] = href.split("#");
      const mdx = readFileSync(`content${guide}.mdx`, "utf8");
      expect(mdx, href).toContain(`[#${anchor}]`);
    }
  });

  it("has an entry for every top-level staff and portal page", () => {
    const routes = ["/", "/portal", ...dirs("app/(app)").map((d) => `/${d}`), ...dirs("app/(portal)/portal").map((d) => `/portal/${d}`)];
    expect(routes.filter((r) => !guideHrefFor(r))).toEqual([]);
  });

  it("picks the most specific entry, and a detail page inherits its area", () => {
    expect(guideHrefFor("/")).toBe("/docs/staff-guide#navigation");
    expect(guideHrefFor("/orders/abc")).toBe("/docs/staff-guide#orders");
    expect(guideHrefFor("/orders/abc/pick")).toBe("/docs/staff-guide#pick-sheet");
    expect(guideHrefFor("/settings/team")).toBe("/docs/staff-guide#team");
    expect(guideHrefFor("/settings/accounting")).toBe("/docs/staff-guide#settings");
    expect(guideHrefFor("/portal/orders/abc")).toBe("/docs/portal-guide#orders");
    expect(guideHrefFor("/ordersX")).toBeUndefined();
    expect(guideHrefFor("/docs/screens")).toBeUndefined();
  });
});

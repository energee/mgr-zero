// tests/design-docs.test.ts — the screen inventory is published as a Fumadocs
// page that renders components/mgr/screens.tsx directly, so it cannot drift
// from the gallery, and it stays outside the documentation agent's allowlist:
// the customer guides are agent-maintained, this page is generated from code.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ScreenIndex } from "../components/mgr/screen-index";
import { SCREENS } from "../components/mgr/screens";

describe("design docs", () => {
  it("publishes both pages in the Fumadocs tree", () => {
    const meta = JSON.parse(readFileSync("content/docs/meta.json", "utf8"));
    expect(meta.pages).toEqual(expect.arrayContaining(["screens", "integrations"]));
    expect(readFileSync("content/docs/screens.mdx", "utf8")).toContain("<ScreenIndex />");
    expect(readFileSync("content/docs/integrations.mdx", "utf8")).toContain('<ScreenIndex kind="venues" />');
  });

  it("splits MGR screens from the external venues, losing none", () => {
    const mgr = renderToStaticMarkup(createElement(ScreenIndex));
    const venues = renderToStaticMarkup(createElement(ScreenIndex, { kind: "venues" as const }));
    for (const s of SCREENS) {
      const [inPage, other] = s.venue ? [venues, mgr] : [mgr, venues];
      expect(inPage, `${s.name} is missing from its page`).toContain(s.name);
      expect(other, `${s.name} appears on both pages`).not.toContain(`>${s.name}<`);
    }
    // Venues group by product, not by the tab a record happens to carry.
    for (const product of ["QuickBooks", "Square", "Slack"]) expect(venues).toContain(product);
  });

  it("stays out of the documentation agent's reach", () => {
    // .github/workflows/documentation-agent.yml allowlists three guides and
    // fails the run on any other path; a generated page must not be editable.
    const wf = readFileSync(".github/workflows/documentation-agent.yml", "utf8");
    expect(wf).not.toContain("screens.mdx");
  });
});

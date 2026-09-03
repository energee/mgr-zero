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
  it("publishes every screen in the Fumadocs tree", () => {
    const meta = JSON.parse(readFileSync("content/docs/meta.json", "utf8"));
    expect(meta.pages).toContain("screens");
    expect(readFileSync("content/docs/screens.mdx", "utf8")).toContain("<ScreenIndex />");
  });

  it("renders every screen's name and job from the inventory itself", () => {
    const html = renderToStaticMarkup(createElement(ScreenIndex));
    for (const s of SCREENS) expect(html).toContain(s.name);
    expect(html).toContain("Repack · sheet");
  });

  it("stays out of the documentation agent's reach", () => {
    // .github/workflows/documentation-agent.yml allowlists three guides and
    // fails the run on any other path; a generated page must not be editable.
    const wf = readFileSync(".github/workflows/documentation-agent.yml", "utf8");
    expect(wf).not.toContain("screens.mdx");
  });
});

// tests/mgr-icon.test.ts — the v1 MGR mark is the single source for favicon,
// in-app chrome, and the GitHub App avatar raster.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MgrIcon } from "@/components/mgr-icon";
import { MGR_ICON_PATH, MGR_ICON_VIEWBOX } from "../lib/mgr-icon";

const root = resolve(__dirname, "..");

function pathFromSvg(svg: string) {
  const match = svg.match(/\sd="([^"]+)"/);
  if (!match) {
    throw new Error("app/icon.svg is missing the mark path");
  }
  return match[1];
}

describe("MGR mark", () => {
  it("keeps app/icon.svg and the React icon on the same path", () => {
    const svg = readFileSync(resolve(root, "app/icon.svg"), "utf8");

    // components/mgr-icon.tsx reads both constants directly, so the only copy
    // that can drift is the literal in app/icon.svg.
    expect({ viewBox: MGR_ICON_VIEWBOX, svgPath: pathFromSvg(svg) }).toEqual({
      viewBox: "0 0 21 25",
      svgPath: MGR_ICON_PATH,
    });
    expect(svg).toContain('aria-label="MGR"');
  });

  it("keeps a favicon.ico fallback for clients without SVG icon support", () => {
    // app/icon.svg alone leaves the conventional /favicon.ico a 404, which
    // crawlers and link unfurlers still request. Raster, so only presence and
    // the ICO magic number are checked - the geometry guard is the SVG above.
    const ico = readFileSync(resolve(root, "app/favicon.ico"));
    expect(ico.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    expect(ico.byteLength).toBeGreaterThan(0);
  });

  it("renders decorative by default and labelled only on request", () => {
    // Both shells and the login form put the mark beside the name it stands
    // for, so labelling it made a screen reader announce MGR twice. Decorative
    // is the default; a label is for where the mark stands alone.
    const bare = renderToStaticMarkup(createElement(MgrIcon));
    expect(bare).toContain('aria-hidden="true"');
    expect(bare).not.toContain("aria-label");

    const labelled = renderToStaticMarkup(createElement(MgrIcon, { label: "MGR" }));
    expect(labelled).toContain('aria-label="MGR"');
    expect(labelled).toContain('role="img"');
  });
});

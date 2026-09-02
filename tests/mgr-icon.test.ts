// tests/mgr-icon.test.ts — the v1 MGR mark is the single source for favicon,
// in-app chrome, and the GitHub App avatar raster.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
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
  it("keeps app/icon.svg, the React icon, and the GitHub raster on the same path", () => {
    const svg = readFileSync(resolve(root, "app/icon.svg"), "utf8");
    const component = readFileSync(resolve(root, "components/mgr-icon.tsx"), "utf8");

    expect({
      viewBox: MGR_ICON_VIEWBOX,
      svgPath: pathFromSvg(svg),
      componentImportsPath: component.includes("MGR_ICON_PATH"),
      componentImportsViewBox: component.includes("MGR_ICON_VIEWBOX"),
    }).toEqual({
      viewBox: "0 0 21 25",
      svgPath: MGR_ICON_PATH,
      componentImportsPath: true,
      componentImportsViewBox: true,
    });
    expect(svg).toContain('aria-label="MGR"');
  });
});

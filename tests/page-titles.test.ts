// tests/page-titles.test.ts — every static staff page names its browser tab
// from the nav (#1109): its source exports `metadata` with navTitle(<its own
// route>), and the root layout's title template appends " · MGR". Detail
// routes (a [param] segment) are left on the plain default until record titles
// are decided; /denied has no nav entry and keeps "MGR".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..", "app", "(app)");

/** Every page.tsx under app/(app), as [route, source]. */
function pages(dir = APP): [string, string][] {
  return readdirSync(dir).flatMap((name): [string, string][] => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    if (name !== "page.tsx") return [];
    return [["/" + relative(APP, dir).split(sep).join("/"), readFileSync(p, "utf8")]];
  });
}

describe("staff page titles", () => {
  const titled = pages().filter(([route]) => !route.includes("[") && route !== "/denied");

  it("finds the static staff pages", () => {
    expect(titled.map(([route]) => route)).toContain("/orders");
    expect(titled.map(([route]) => route)).toContain("/");
  });

  it("titles each one with navTitle of its own route", () => {
    for (const [route, source] of titled) {
      expect.soft(source, route).toContain(`export const metadata = { title: navTitle("${route}") };`);
    }
  });
});

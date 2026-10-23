// tests/page-titles.test.ts — every page under app/(app) names its browser
// tab from the nav (#1109): its source exports `metadata` with navTitle of its
// static route, and the root layout's title template appends " · MGR". A
// record page (a [param] segment) takes its static parent's section title, so
// /orders/[id]/ship reads "Orders" (#1230), with no generateMetadata fetch.
// /denied has no nav entry and keeps "MGR". Pages outside app/(app), such as
// app/(auth)/settings/chat/link, are not checked.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const APP = join(ROOT, "app", "(app)");

/** Every page.tsx under app/(app), as [route, source]. */
function pages(dir = APP): [string, string][] {
  return readdirSync(dir).flatMap((name): [string, string][] => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    if (name !== "page.tsx") return [];
    return [["/" + relative(APP, dir).split(sep).join("/"), readFileSync(p, "utf8")]];
  });
}

/** The route up to its first [param] segment: /orders/[id]/ship → /orders. */
function staticParent(route: string): string {
  const i = route.indexOf("/[");
  return i === -1 ? route : route.slice(0, i);
}

describe("staff page titles", () => {
  const titled = pages().filter(([route]) => route !== "/denied");

  it("finds the static and record staff pages", () => {
    const routes = titled.map(([route]) => route);
    expect(routes).toContain("/orders");
    expect(routes).toContain("/");
    expect(routes).toContain("/orders/[id]");
  });

  it("titles each one with navTitle of its static route", () => {
    for (const [route, source] of titled) {
      expect.soft(source, route).toContain(`export const metadata = { title: navTitle("${staticParent(route)}") };`);
    }
  });
});

describe("title suffix", () => {
  it("the root layout appends \" · MGR\" to every page title", () => {
    expect(readFileSync(join(ROOT, "app", "layout.tsx"), "utf8")).toContain('template: "%s · MGR"');
  });

  it("the docs page leaves the suffix to the root template", () => {
    expect(readFileSync(join(ROOT, "app", "(docs)", "docs", "[[...slug]]", "page.tsx"), "utf8")).not.toContain("· MGR");
  });
});

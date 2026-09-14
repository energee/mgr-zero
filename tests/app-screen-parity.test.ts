// tests/app-screen-parity.test.ts — the inventory (components/mgr/screens.tsx)
// is a promise: every ungated MGR screen has a live page. Program 10's
// definition of done (TODO.md). Red until each program lands its pages and
// adds their public route entries to lib/mgr/screen-routes.ts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { SCREEN_ROUTES, ungatedMgrScreens } from "@/lib/mgr/screen-routes";

function usesMgrDrawing(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  if (/from "@\/components\/mgr\/(e|command-form|views\/[^\"]+)"/.test(source)) return true;
  return [...source.matchAll(/from "([^\"]+)"/g)].some(([, specifier]) => {
    const base = specifier.startsWith("@/") ? specifier.slice(2) : specifier.startsWith(".") ? resolve(dirname(file), specifier) : "";
    const dependency = [base, `${base}.tsx`, `${base}.ts`, resolve(base, "index.tsx"), resolve(base, "index.ts")].find(existsSync);
    return dependency ? usesMgrDrawing(dependency, seen) : false;
  });
}

describe("explorer parity", () => {
  it("maps every live product page unless its route has recorded parity debt", () => {
    const knownRouteDebt = [
      "app/(app)/cellar/[occupancyId]/reading/page.tsx",
      "app/(app)/search/page.tsx",
    ];
    const mapped = new Set(SCREEN_ROUTES.map((route) => route.file));
    const pages = readdirSync("app", { recursive: true })
      .map((file) => `app/${file}`)
      .filter((file) => /^app\/\((app|auth|portal)\)\/.+\/page\.tsx$/.test(file))
      .sort();

    expect(pages.filter((page) => !mapped.has(page))).toEqual(knownRouteDebt);
  });

  it("keeps TODO's screen totals aligned with the executable parity inventory", () => {
    const todo = readFileSync("TODO.md", "utf8");
    const mgr = SCREENS.filter((screen) => !screen.venue);
    const ungated = ungatedMgrScreens();
    const mapped = new Set(SCREEN_ROUTES.map((route) => route.name));
    const unmapped = ungated.filter((screen) => !mapped.has(screen.name));

    expect(todo).toContain(
      `${mgr.length} MGR screens: ${ungated.length} ungated and mapped, ${mgr.length - ungated.length} gated, and ${unmapped.length} ungated without a live route`,
    );
  });

  it("every ungated MGR screen names a live page that exists", () => {
    const file = new Map(SCREEN_ROUTES.map((r) => [r.name, r.file]));
    const missing = ungatedMgrScreens()
      .map((s) => s.name)
      .filter((name) => !file.has(name) || !existsSync(file.get(name)!));
    expect(missing, "add a live page and its SCREEN_ROUTES row, or gate the screen").toEqual([]);
  });

  it("every live page draws in the E vocabulary, not raw markup", () => {
    // Shell chrome (components/) and sign-in cards (app/(auth)) draw with the ui kit; routed screens follow thin adapters until they reach E, CommandForm, or a shared view.
    const files = [...new Set(SCREEN_ROUTES.map((r) => r.file))].filter((f) => existsSync(f) && !f.startsWith("components/") && !f.startsWith("app/(auth)/"));
    const raw = files.filter((file) => !usesMgrDrawing(file));
    expect(raw, "rewrite the page with E.*, CommandForm, or a screen view (Program 10 task 7)").toEqual([]);
  });

  it("every SCREEN_ROUTES row names an existing screen and file", () => {
    const names = new Set(ungatedMgrScreens().map((s) => s.name));
    const bad = SCREEN_ROUTES.filter((r) => !names.has(r.name) || !existsSync(r.file)).map((r) => r.name);
    expect(bad).toEqual([]);
  });

  it("maps live production screens without stale inventory gates", () => {
    const routes = new Map(SCREEN_ROUTES.map((route) => [route.name, route.file]));
    const names = new Set(ungatedMgrScreens().map((screen) => screen.name));
    expect([...names].filter((name) => ["Packaging runs", "Planning"].includes(name))).toEqual([
      "Packaging runs", "Planning",
    ]);
    expect(routes.get("Packaging runs")).toBe("app/(app)/packaging/page.tsx");
    expect(routes.get("Planning")).toBe("app/(app)/planning/page.tsx");
  });
});

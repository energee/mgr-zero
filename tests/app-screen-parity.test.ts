// tests/app-screen-parity.test.ts — the inventory (components/mgr/screens.tsx)
// is a promise: every ungated MGR screen has a live page. Program 10's
// definition of done (TODO.md). Red until each program lands its pages and
// adds their rows to lib/mgr/screen-routes.ts.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCREEN_ROUTES, ungatedMgrScreens } from "@/lib/mgr/screen-routes";

describe("explorer parity", () => {
  it("every ungated MGR screen names a live page that exists", () => {
    const file = new Map(SCREEN_ROUTES.map((r) => [r.name, r.file]));
    const missing = ungatedMgrScreens()
      .map((s) => s.name)
      .filter((name) => !file.has(name) || !existsSync(file.get(name)!));
    expect(missing, "add a live page and its SCREEN_ROUTES row, or gate the screen").toEqual([]);
  });

  it("every live page draws in the E vocabulary, not raw markup", () => {
    // Shell chrome (components/) and the sign-in cards (app/(auth)) draw with the ui kit; every page under a shell draws with E, CommandForm, or a shared screen view.
    const files = [...new Set(SCREEN_ROUTES.map((r) => r.file))].filter((f) => existsSync(f) && !f.startsWith("components/") && !f.startsWith("app/(auth)/"));
    const raw = files.filter((f) => !/from "@\/components\/mgr\/(e|command-form|views\/[^"]+)"/.test(readFileSync(f, "utf8")));
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
    expect([...names].filter((name) => ["Fermentation reading", "Packaging runs", "Schedule packaging run", "Planning", "Repack"].includes(name))).toEqual([
      "Fermentation reading", "Packaging runs", "Schedule packaging run", "Planning", "Repack",
    ]);
    expect(routes.get("Fermentation reading")).toBe("app/(app)/cellar/[occupancyId]/reading/page.tsx");
    expect(routes.get("Packaging runs")).toBe("app/(app)/packaging/page.tsx");
    expect(routes.get("Schedule packaging run")).toBe("app/(app)/packaging/schedule-run-form.tsx");
    expect(routes.get("Planning")).toBe("app/(app)/planning/page.tsx");
    expect(routes.get("Repack")).toBe("app/(app)/packaging/repack-form.tsx");
  });
});

// tests/app-screen-parity.test.ts — the inventory (components/mgr/screens.tsx)
// is a promise: every ungated MGR screen has a live page. Program 10's
// definition of done (TODO.md). Red until each program lands its pages and
// adds their rows to lib/mgr/screen-routes.ts.
import { existsSync } from "node:fs";
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

  it("every SCREEN_ROUTES row names an existing screen and file", () => {
    const names = new Set(ungatedMgrScreens().map((s) => s.name));
    const bad = SCREEN_ROUTES.filter((r) => !names.has(r.name) || !existsSync(r.file)).map((r) => r.name);
    expect(bad).toEqual([]);
  });
});

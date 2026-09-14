import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { SCREEN_ROUTES } from "@/lib/mgr/screen-routes";

it("keeps route transitions free of the removed loading skeleton", () => {
  expect(existsSync("app/(app)/loading.tsx")).toBe(false);
  expect(existsSync("components/mgr/views/page-loading.tsx")).toBe(false);
  expect(SCREENS.some(screen => screen.name === "Page loading")).toBe(false);
  expect(SCREEN_ROUTES.some(screen => screen.name === "Page loading")).toBe(false);
});

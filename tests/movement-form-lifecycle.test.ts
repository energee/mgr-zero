// #1300: URL-driven dialog lifecycle and stale-close isolation across navigation.
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type * as React from "react";
import type { ReactElement } from "react";

// Keep hook state across route renders: static markup alone misses a mounted
// inventory form whose original defaultOpen was false.
const state = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
vi.mock("react", async original => ({
  ...await original<typeof React>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = typeof initial === "function" ? initial() : initial;
    return [state.values[index], (value: unknown) => { state.values[index] = typeof value === "function" ? value(state.values[index]) : value; }];
  },
}));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}));
vi.mock("@/lib/brewery-provider", () => ({ useBrewery: () => "brewery-a", useCommandContext: () => ({ actorId: "actor-a", breweryId: "brewery-a" }) }));
import { MovementForm } from "@/app/(app)/inventory/movement-form";

type Dialog = ReactElement<{ open: boolean; onOpenChange: (open: boolean) => void }>;
let url: URL;
const navigate = (href: string) => {
  url = new URL(href, "http://mgr.test");
  vi.stubGlobal("location", url);
  window.location = url;
};
const history = {
  replaceState: vi.fn((_state: unknown, _unused: string, href: string) => navigate(href)),
  pushState: vi.fn((_state: unknown, _unused: string, href: string) => navigate(href)),
};
function render() {
  state.cursor = 0;
  return MovementForm({ skus: [], locations: [], bins: [], channels: [], timeZone: "UTC", skusHref: null }).props.children as Dialog[];
}
beforeEach(() => {
  state.values = [];
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: new URL("http://mgr.test/inventory"), history });
  navigate("/inventory");
});
afterEach(() => vi.unstubAllGlobals());

it("opens a retained inventory form when Today navigates to the movement URL after Ask MGR closes", () => {
  expect(render()[0].props.open).toBe(false);
  // Drawer close does not own navigation. The following client navigation
  // must open even when Next retains the manual form's existing hook state.
  navigate("/inventory?recordMovement=1");
  expect(render()[0].props.open).toBe(true);
  render()[0].props.onOpenChange(false);
  expect(url.pathname + url.search).toBe("/inventory");
  expect(render()[0].props.open).toBe(false);
  navigate("/inventory?recordMovement=1");
  expect(render()[0].props.open).toBe(true);
});

it.each(["/", "/inventory?recordMovement=1&movementHandoff=new", "/inventory?page=2"])("ignores an old dialog close after newer navigation to %s", href => {
  navigate("/inventory?recordMovement=1&movementHandoff=old");
  const oldClose = render()[0].props.onOpenChange;
  navigate(href);
  oldClose(false);
  expect(url.pathname + url.search).toBe(href);
  expect(history.replaceState).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

it("clears its own deep link synchronously before newer navigation and preserves pagination", () => {
  navigate("/inventory?recordMovement=1&skuId=s1&page=3");
  render()[0].props.onOpenChange(false);
  expect(url.pathname + url.search).toBe("/inventory?page=3");
  navigate("/inventory?recordMovement=1");
  expect(render()[0].props.open).toBe(true);
  expect(router.replace).not.toHaveBeenCalled();
});

it("the inventory trigger opens via URL state and browser Back closes it", () => {
  render()[0].props.onOpenChange(true);
  expect(url.searchParams.get("recordMovement")).toBe("1");
  expect(render()[0].props.open).toBe(true);
  navigate("/inventory");
  expect(render()[0].props.open).toBe(false);
});

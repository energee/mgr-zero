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
  useCallback: (callback: unknown) => callback,
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
  Object.assign(window, { location: url });
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

it("clears only movement parameters synchronously and preserves pagination, unrelated queries, and the fragment", () => {
  navigate("/inventory?recordMovement=1&movementHandoff=old&skuId=s1&locationId=l1&binId=b1&lotId=lot1&qty=2&type=depletion&saleChannelId=c1&destState=PA&note=sample&page=3&filter=available&filter=allocated#stock");
  render()[0].props.onOpenChange(false);
  expect(url.pathname + url.search + url.hash).toBe("/inventory?page=3&filter=available&filter=allocated#stock");
  navigate("/inventory?recordMovement=1");
  expect(render()[0].props.open).toBe(true);
  expect(router.replace).not.toHaveBeenCalled();
});

it("the inventory trigger opens via URL state and browser Back closes it", () => {
  navigate("/inventory?page=2&filter=available#stock");
  render()[0].props.onOpenChange(true);
  expect(url.searchParams.get("recordMovement")).toBe("1");
  expect(url.pathname + url.search + url.hash).toBe("/inventory?page=2&filter=available&recordMovement=1#stock");
  expect(render()[0].props.open).toBe(true);
  navigate("/inventory");
  expect(render()[0].props.open).toBe(false);
});

// A Finished goods row links /inventory?recordMovement=1&skuId=…; on
// /inventory that soft-navigates into the mounted form, whose fields were
// seeded only on mount (#1507). Each new deep link's SKU must still be chosen.
it("chooses the SKU each newer deep link names in a form already mounted (#1507)", () => {
  const skus = [{ id: "s1", label: "Hazy · Keg", bblPerUnit: 0.5 }, { id: "s2", label: "Pils · Case", bblPerUnit: 0.3 }];
  // The dialog holds <form>, which holds RecordMovementView and its model.
  type FormDialog = Dialog & { props: { children: ReactElement<{ children: ReactElement<{ model: { skuId: string } }> }> } };
  const dialog = () => {
    state.cursor = 0;
    return (MovementForm({ skus, locations: [], bins: [], channels: [], timeZone: "UTC", skusHref: null }).props.children as FormDialog[])[0];
  };
  // React re-renders at once after a render-phase update; this mock needs a second call.
  function sku() {
    dialog();
    return dialog().props.children.props.children.props.model.skuId;
  }
  expect(sku()).toBe("");
  navigate("/inventory?recordMovement=1&skuId=s1");
  expect(sku()).toBe("s1");
  dialog().props.onOpenChange(false);
  expect(sku()).toBe("");
  navigate("/inventory?recordMovement=1&skuId=s1");
  expect(sku()).toBe("s1");
  dialog().props.onOpenChange(false);
  navigate("/inventory?recordMovement=1&skuId=s2");
  expect(sku()).toBe("s2");
  dialog().props.onOpenChange(false);
  navigate("/inventory?recordMovement=1&skuId=unknown");
  expect(sku()).toBe("");
});

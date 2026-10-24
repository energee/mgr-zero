// tests/movement-form.test.ts — #1107: the live Record movement form starts
// with no type picked (a deep-linked type still preselects), and closing a
// form a deep link opened drops ?recordMovement=1 and its prefill from the URL,
// while a successful record leaves the URL for the receipt dialog to clear.
// #1113: the withheld Record movement says what it still needs, and an empty
// SKU picker links Catalog only for a user who may create a SKU.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => location.pathname, useSearchParams: () => new URLSearchParams(location.search) }));
vi.mock("@/lib/brewery-provider", () => ({ useBrewery: () => "brewery-a", useCommandContext: () => ({ actorId: "actor-a", breweryId: "brewery-a" }) }));
vi.mock("@/lib/commands/client", async (original) => ({ ...(await original<typeof import("@/lib/commands/client")>()), command: vi.fn(async () => receipt) }));
type FormProps = { open: boolean; onOpenChange: (open: boolean) => void; children: ReactElement<{ onSubmit: (e: unknown) => void }> };
let forms: FormProps[] = [];
vi.mock("@/components/mgr/command-form", async (original) => {
  const real = await original<typeof import("@/components/mgr/command-form")>();
  return { ...real, CommandForm: (props: FormProps) => { forms.push(props); return createElement("div", { "data-dialog": true }, props.children); } };
});
import { MovementForm } from "@/app/(app)/inventory/movement-form";

const receipt = { id: "m1", created_at: "2026-10-22T12:00:00Z", sku_id: "s1", location_id: "l1", bin_id: "b1", qty: 2, bbl: 0.6, type: "production_in", dest_state: null, sale_channel_id: null, lot_id: null, ref: null, note: null };
const lists = {
  skus: [{ id: "s1", label: "Lantern Pils · Case", bblPerUnit: 0.3 }],
  locations: [{ id: "l1", name: "Back warehouse", uses: [] }],
  bins: [{ id: "b1", location_id: "l1", name: "Cold" }],
  channels: [{ id: "c1", name: "Taproom" }],
  timeZone: "America/New_York",
  skusHref: "/catalog",
};
const filled = { skuId: "s1", locationId: "l1", binId: "b1", qty: 2 };
const render = (props: Partial<Parameters<typeof MovementForm>[0]> = {}) => {
  forms = [];
  return renderToStaticMarkup(createElement(MovementForm, { ...lists, ...props }));
};
// The form reads window.location; useCommandForm reads the bare global.
const setUrl = (search: string) => {
  const location = { pathname: "/inventory", search, hash: "" };
  vi.stubGlobal("location", location);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location, history: { replaceState: vi.fn(), pushState: vi.fn() } }));
};
const submitDisabled = (html: string) => / disabled=""/.test(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "");

beforeEach(() => {
  Object.values(router).forEach((fn) => fn.mockClear());
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  setUrl("?recordMovement=1&skuId=s1&type=depletion&movementHandoff=h1&page=3");
});
afterEach(() => vi.unstubAllGlobals());

it("starts with no movement type picked and keeps Record movement disabled until one is", () => {
  const html = render({ initial: filled });
  expect(html).not.toContain('data-state="on"');
  expect(html).toContain("Select movement type");
  expect(submitDisabled(html)).toBe(true);
  expect(html).toContain("Still needed: movement type.");
  expect(html).not.toContain("Preview:");
});

it("previews a complete movement beside the enabled button (#1113)", () => {
  const ready = render({ initial: { ...filled, type: "production_in" } });
  expect(ready).not.toContain("Still needed");
  expect(ready).toContain("Preview: +2 SKU units");
  expect(submitDisabled(ready)).toBe(false);
});

it("explains the disabled Bin and names untracked stock without migration jargon (#1252)", () => {
  const empty = render();
  expect(empty).toContain("Choose a location first");
  expect(empty).toContain("No lot (untracked)");
  expect(empty).not.toContain("legacy stock");
  const located = render({ initial: filled });
  expect(located).not.toContain("Choose a location first");
  expect(located).toContain("Cold");
  const noBins = render({ initial: { locationId: "l1" }, bins: [] });
  expect(noBins).toContain("No bins at this location");
});

it("Record movement carries the irreversible fill, as its inventory frame draws it: a movement is append-only (#1113)", () => {
  expect(render({ initial: { ...filled, type: "production_in" } })).toMatch(/<button[^>]*type="submit"[^>]*data-variant="irreversible"[^>]*>Record movement<\/button>|<button[^>]*data-variant="irreversible"[^>]*type="submit"[^>]*>Record movement<\/button>/);
});

it("an empty SKU picker links Catalog for a user who may create a SKU, and otherwise names who can (#1113)", () => {
  expect(render({ skus: [] })).toMatch(/No SKUs yet\. <a[^>]*href="\/catalog"[^>]*>Add a SKU</);
  const html = render({ skus: [], skusHref: null });
  expect(html).toContain("No SKUs yet. An admin or sales member adds them in Catalog.");
  expect(html).not.toContain('href="/catalog"');
});

it("preselects the type a deep link passes (the Ask MGR handoff)", () => {
  const html = render({ initial: { ...filled, type: "production_in" } });
  expect(html).toMatch(/data-state="on"[^>]*>Production in</);
  expect(submitDisabled(html)).toBe(false);
});

it("closing a deep-linked form replaces the URL with the bare inventory page, keeping ?page", () => {
  render();
  forms[0].onOpenChange(false);
  expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/inventory?page=3");
  setUrl("?recordMovement=1");
  render();
  forms[0].onOpenChange(false);
  expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/inventory");
});

it("closing an already-closed form leaves the URL alone", () => {
  setUrl("");
  render();
  forms[0].onOpenChange(false);
  expect(window.history.replaceState).not.toHaveBeenCalled();
});

it("a successful record does not replace the URL; closing its receipt dialog does", async () => {
  render({ initial: { ...filled, type: "production_in" } });
  await forms[0].children.props.onSubmit({ preventDefault() {}, stopPropagation() {} });
  await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
  expect(window.history.replaceState).not.toHaveBeenCalled();
  forms[1].onOpenChange(false);
  expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/inventory?page=3");
});

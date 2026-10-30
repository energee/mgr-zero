// Live Pick/Short callbacks retain unsaved counts without committing them first;
// Short opens its sheet over Pick, so the working counts never leave the page.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { PickView } from "@/components/mgr/views/pick";
import type { ShortPickView } from "@/components/mgr/views/short-pick";
const action = vi.hoisted(() => ({ run: vi.fn(), setError: vi.fn(), push: vi.fn(), error: null as string | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: action.push }) }));
vi.mock("@/lib/brewery-provider", () => ({ useCommandContext: () => ({ actorId: "actor", breweryId: "brewery" }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => ({ ...action, busy: false }) }));
let submit: (event: { preventDefault: () => void }) => void;
let back: (event: { target: Element; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number; preventDefault: () => void }) => void;
let sheet: { type: unknown; props: { snapshot: { line: { id: string; qty_picked: number } }; onClose: () => void } } | undefined;
/** PickForm's hooks run as this harness's own, so an onShort during render re-renders it with the sheet open. */
function PickHarness({ shortLine, save }: { shortLine?: string; save?: boolean }) {
  const element = PickForm({ snapshot });
  const [form, open] = element.props.children;
  if (shortLine && !open) form.props.children.props.onShort(shortLine);
  if (save && !form.props.children.props.submitting) form.props.onSubmit({ preventDefault() {} });
  sheet = open || undefined;
  submit = form.props.onSubmit;
  back = form.props.onClickCapture;
  return element;
}
let pick: ComponentProps<typeof PickView>;
let short: ComponentProps<typeof ShortPickView>;
vi.mock("@/components/mgr/views/pick", () => ({ PickView: (props: typeof pick) => { pick = props; return props.messages ?? null; } }));
vi.mock("@/components/mgr/views/short-pick", () => ({ ShortPickView: (props: typeof short) => { short = props; return null; } }));
import { PickForm } from "@/app/(app)/orders/[id]/pick-form";
import { ShortPickForm } from "@/app/(app)/orders/[id]/short-pick-form";
const close = vi.fn();
function ShortHarness({ save }: { save?: boolean }) {
  const element = ShortPickForm({ snapshot: { order: snapshot.order, line: snapshot.lines[0], locations: [] }, onClose: close });
  const form = element.props.children;
  const props = form.props.children.props as typeof short;
  short = props;
  if (!props.reasonValue) props.onReason!("Fictional shortage");
  if (save && props.reasonValue && !props.submitting) form.props.onSubmit({ preventDefault() {} });
  submit = form.props.onSubmit;
  return element;
}
const snapshot = { backHref: "/orders/order", order: { id: "order", order_no: 1, from_location_id: "source", customers: null }, lines: [
  { id: "short", sku_id: "a", qty_ordered: 5, qty_picked: 2, skus: null },
  { id: "other", sku_id: "b", qty_ordered: 8, qty_picked: 6, skus: null },
], locations: [] };
const key = "mgr:pick-counts:actor:brewery:order";
beforeEach(() => {
  vi.resetAllMocks();
  action.error = null;
  action.setError.mockImplementation((error: string) => { action.error = error; });
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } });
});
afterEach(() => vi.unstubAllGlobals());

it("opens Short pick as a sheet over Pick with the line's working count, without leaving or a record_pick (#1503)", () => {
  renderToStaticMarkup(createElement(PickHarness));
  expect(sheet).toBeUndefined();
  pick.onQuantity!("other", "4");
  renderToStaticMarkup(createElement(PickHarness, { shortLine: "short" }));
  expect(sheet?.type).toBe(ShortPickForm);
  expect(sheet?.props.snapshot.line).toMatchObject({ id: "short", qty_picked: 2 });
  expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({ other: { value: "4" } });
  expect(action.push).not.toHaveBeenCalled();
  expect(action.run).not.toHaveBeenCalled();
});

it("retires working counts only after a successful Done picking", () => {
  renderToStaticMarkup(createElement(PickHarness));
  pick.onQuantity!("other", "6");
  submit({ preventDefault() {} });
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(action.push).not.toHaveBeenCalled();
  const committed = action.run.mock.calls[0][2] as () => void;
  committed();
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(action.push).toHaveBeenCalledWith("/orders/order");
});

it("blocks another Done picking after commit while navigation is pending", () => {
  renderToStaticMarkup(createElement(PickHarness));
  submit({ preventDefault() {} });
  (action.run.mock.calls[0][2] as () => void)();
  submit({ preventDefault() {} });
  expect(action.run).toHaveBeenCalledOnce();
});

it("keeps the saved warning and lets a partial pick continue after persistent draft cleanup failure", () => {
  const remove = vi.spyOn(sessionStorage, "removeItem").mockImplementation(() => { throw Error("blocked"); });
  action.run.mockImplementation((_command, _input, committed: () => void) => { committed(); });
  const html = renderToStaticMarkup(createElement(PickHarness, { save: true }));
  expect(action.run).toHaveBeenCalledWith("record_pick", expect.any(Object), expect.any(Function));
  expect(html).toContain("Pick saved, but working counts could not be cleared.");
  expect(html).toContain('href="/orders/order"');
  expect(html).toContain("Continue to saved order");
  expect(action.push).not.toHaveBeenCalled();
  const preventDefault = vi.fn();
  back({ target: { closest: () => ({ getAttribute: () => snapshot.backHref }) } as unknown as Element, button: 0, preventDefault });
  expect(preventDefault).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledOnce();
  expect(action.setError).toHaveBeenCalledOnce();
  expect(action.error).toContain("Pick saved");
});

it("keeps a saved Short warning until the user explicitly returns to Pick", () => {
  vi.spyOn(sessionStorage, "getItem").mockImplementation(() => { throw Error("blocked"); });
  action.run.mockImplementation((_command, _input, committed: () => void) => { committed(); });
  renderToStaticMarkup(createElement(ShortHarness, { save: true }));
  expect(action.run).toHaveBeenCalledWith("resolve_short_pick", expect.objectContaining({ reason: "Fictional shortage" }), expect.any(Function));
  expect(close).not.toHaveBeenCalled();
  expect(action.push).not.toHaveBeenCalled();
  const messages = short.messages as React.ReactElement<{ children: React.ReactElement[] }>;
  expect(renderToStaticMarkup(messages)).toContain("Short pick saved, but working counts could not be updated.");
  const backToPick = messages.props.children[1] as React.ReactElement<{ onClick: () => void }>;
  backToPick.props.onClick();
  expect(close).toHaveBeenCalledOnce();
  expect(action.error).toContain("Short pick saved");
});

it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"])("keeps working counts on a modified back click (%s)", modifier => {
  renderToStaticMarkup(createElement(PickHarness));
  pick.onQuantity!("other", "6");
  back({ target: { closest: () => ({ getAttribute: () => "/orders/order" }) } as unknown as Element, [modifier]: true, button: 0, preventDefault() {} });
  expect(sessionStorage.getItem(key)).not.toBeNull();
});

it("applies consecutive quantity edits without losing the first observation", () => {
  renderToStaticMarkup(createElement(PickHarness));
  pick.onQuantity!("short", "1");
  pick.onQuantity!("other", "4");
  expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({ short: { value: "1" }, other: { value: "4" } });
});

it("keeps the existing explicit shortage reason guard", () => {
  // The sheet portals its body, which a static render leaves out; read the view's props from the tree.
  function Harness() {
    const element = ShortPickForm({ snapshot: { order: snapshot.order, line: snapshot.lines[0], locations: [] }, onClose: close });
    short = element.props.children.props.children.props;
    return element;
  }
  renderToStaticMarkup(createElement(Harness));
  expect(short.disabled).toBe(true);
  expect(short.reasonValue).toBe("");
});

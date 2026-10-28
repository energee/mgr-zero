// A committed pick command stays successful when its observation cleanup storage is unavailable.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { push, refresh, notice } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), notice: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast: { error: notice } }));
vi.mock("@/lib/brewery-provider", () => ({ useBrewery: () => "brewery", useCommandContext: () => ({ actorId: "actor", breweryId: "brewery" }) }));
vi.mock("@/components/mgr/views/pick", () => ({ PickView: () => null }));
vi.mock("@/components/mgr/views/short-pick", () => ({ ShortPickView: () => null }));
import { PickForm } from "@/app/(app)/orders/[id]/pick-form";
import { ShortPickForm } from "@/app/(app)/orders/[id]/short-pick-form";
const order = { id: "order", order_no: 1, from_location_id: "source", customers: null };
const line = { id: "line", sku_id: "sku", qty_ordered: 5, qty_picked: 2, skus: null };
let submit: (event: { preventDefault(): void }) => void;
const close = vi.fn();
function Harness({ shortage }: { shortage: boolean }) {
  // ShortPickForm is a CommandForm around its form; PickForm is its form beside the (closed) Short sheet.
  const element = shortage ? ShortPickForm({ snapshot: { order, line, locations: [] }, onClose: close }) : PickForm({ snapshot: { order, lines: [line], locations: [] } });
  const form = shortage ? element.props.children : element.props.children[0];
  if (shortage && !form.props.children.props.reasonValue) {
    form.props.children.props.onReason("Fictional shortage");
  }
  submit = form.props.onSubmit;
  return element;
}
beforeEach(() => {
  vi.clearAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => { if (key.startsWith("mgr:pick-counts:")) throw Error("cleanup blocked"); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => { if (key.startsWith("mgr:pick-counts:")) throw Error("cleanup blocked"); values.delete(key); },
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("location", { pathname: "/orders/order/pick" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: {} }) })));
});
afterEach(() => vi.unstubAllGlobals());
it.each([false, true])("actual command run leaves or closes and refreshes after cleanup failure (short=%s)", async shortage => {
  renderToStaticMarkup(createElement(Harness, { shortage }));
  submit({ preventDefault() {} });
  // Done picking leaves Pick; a resolved Short closes its sheet and Pick refreshes in place.
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  if (shortage) { expect(close).toHaveBeenCalledOnce(); expect(push).not.toHaveBeenCalled(); }
  else expect(push).toHaveBeenCalledWith("/orders/order");
  expect(notice).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
  // Successful transport recovery was retired: no false "Retry saved request" remains.
  expect(sessionStorage.getItem('mgr-command-recovery-v1:["actor","brewery",null]')).toBeNull();
});

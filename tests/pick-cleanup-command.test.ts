// A committed pick command stays successful when its observation cleanup storage is unavailable.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { push, refresh, notice } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), notice: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast: { error: notice } }));
vi.mock("@/app/(app)/brewery-provider", () => ({ useBrewery: () => "brewery", useCommandContext: () => ({ actorId: "actor", breweryId: "brewery" }) }));
vi.mock("@/components/mgr/views/pick", () => ({ PickView: () => null }));
vi.mock("@/components/mgr/views/short-pick", () => ({ ShortPickView: () => null }));
import { PickForm } from "@/app/(app)/orders/[id]/pick-form";
import { ShortPickForm } from "@/app/(app)/orders/[id]/short-pick-form";
const order = { id: "order", order_no: 1, from_location_id: "source", customers: null };
const line = { id: "line", sku_id: "sku", qty_ordered: 5, qty_picked: 2, skus: null };
let submit: (event: { preventDefault(): void }) => void;
function Harness({ shortage }: { shortage: boolean }) {
  const element = shortage ? ShortPickForm({ snapshot: { order, line, locations: [] } }) : PickForm({ snapshot: { order, lines: [line], locations: [] } });
  if (shortage && !element.props.children.props.reasonValue) {
    element.props.children.props.onReason("Fictional shortage");
  }
  submit = element.props.onSubmit;
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
it.each([false, true])("actual command run navigates and refreshes after cleanup failure (short=%s)", async shortage => {
  renderToStaticMarkup(createElement(Harness, { shortage }));
  submit({ preventDefault() {} });
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith(shortage ? "/orders/order/pick" : "/orders/order"));
  expect(refresh).toHaveBeenCalledOnce();
  expect(notice).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
  // Successful transport recovery was retired: no false "Retry saved request" remains.
  expect(sessionStorage.getItem('mgr-command-recovery-v1:["actor","brewery",null]')).toBeNull();
});

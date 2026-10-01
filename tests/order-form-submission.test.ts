// Exercises the real OrderForm submit boundary with controlled hook state, without a database.
import { beforeEach, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const harness = vi.hoisted(() => ({ values: [] as unknown[], renderingOrder: false, sent: [] as unknown[] }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(), useState: (initial: unknown) => {
  // Only OrderForm fields use the queue; shared child controls keep their own defaults.
  if (!harness.renderingOrder) return [typeof initial === "function" ? initial() : initial, vi.fn()];
  if (harness.values.length === 0) throw new Error("OrderForm test exhausted its field-state queue");
  return [harness.values.shift(), vi.fn()];
} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: () => ({ data: [] }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: (_name: string, opts: { build: () => unknown }) => {
  return { submit: () => { harness.sent.push(opts.build()); }, submitting: false, error: null };
} }));
import { OrderForm } from "@/app/(app)/orders/order-form";

beforeEach(() => { harness.values = []; harness.sent = []; });
const complete = { skuId: "sku-1", qty: "12" };
function render(lines: { skuId: string; qty: string }[]) {
  harness.values = ["wholesale", "customer", "dock", "source", "", "", "", lines];
  harness.renderingOrder = true;
  try { return OrderForm({ customers: [], locations: [], skus: [] }); }
  finally { harness.renderingOrder = false; }
}

it.each([
  { skuId: "sku-2", qty: "" }, { skuId: "", qty: "3" },
  { skuId: "sku-2", qty: "0" }, { skuId: "sku-2", qty: "-1" },
  { skuId: "sku-2", qty: "bad" }, { skuId: "sku-2", qty: "Infinity" },
])("prevents actual submission and shows feedback for an entered invalid row: %j", partial => {
  const form = render([complete, partial]);
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent;
  form.props.onSubmit(event);
  expect(harness.sent).toEqual([]);
  const view = form.props.children;
  expect(view.props.disabled).toBe(true);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  const html = renderToStaticMarkup(view);
  expect(html).toContain('Line 2: select a SKU and enter a quantity greater than zero, or remove the line.');
  expect(html).toMatch(/<p[^>]*role="status"[^>]*>Line 2:/);
});

it("asks to complete the only row without offering nonexistent clearing or Remove actions", () => {
  const view = render([{ skuId: "sku-1", qty: "" }]).props.children;
  const html = renderToStaticMarkup(view);
  expect(html).toContain('Line 1: select a SKU and enter a quantity greater than zero.');
  expect(html).not.toContain('clear the line');
  expect(html).not.toContain('remove the line');
  expect(html).toContain('role="status"');
});

it("sends every valid line and ignores only wholly blank spare rows", () => {
  const form = render([complete, { skuId: "", qty: "" }, { skuId: "sku-2", qty: "2.5" }]);
  form.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
  expect(harness.sent).toEqual([expect.objectContaining({ lines: [{ skuId: "sku-1", qty: 12 }, { skuId: "sku-2", qty: 2.5 }] })]);
});

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
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: () => ({ data: [
  { id: "sku-1", name: "One", brands: null }, { id: "sku-2", name: "Two", brands: null },
] }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: (_name: string, opts: { build: () => unknown }) => {
  return { submit: () => { harness.sent.push(opts.build()); }, submitting: false, error: null };
} }));
import { OrderForm } from "@/app/(app)/orders/order-form";

beforeEach(() => { harness.values = []; harness.sent = []; });
const complete = { skuId: "sku-1", qty: "12" };
function render(lines: { skuId: string; qty: string }[], kind: "wholesale" | "taproom_transfer" = "wholesale", emptyCatalog = false) {
  harness.values = [kind, "customer", "dock", "source", "", "", "", false, lines];
  harness.renderingOrder = true;
  // Selected SKUs must be offered options, or #714's unavailable-SKU gate blocks the save instead.
  try { return OrderForm({ timeZone: "America/Los_Angeles",
    customers: emptyCatalog ? [] : [{ id: "customer", name: "Buyer", sale_channel_id: "channel", shipTos: [{ id: "dock", label: "Dock" }] }],
    locations: [{ id: "source", name: "Warehouse", kind: "warehouse" }],
    skus: emptyCatalog ? [] : [{ id: "sku-1", label: "One" }, { id: "sku-2", label: "Two" }],
  }); }
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
  expect(view.props.reason).toBeTruthy();
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  // Save draft names what is still needed at once; the line's own field error
  // waits until the user leaves its quantity (#1121, #1122; tests/form-feedback.test.ts).
  expect(view.props.reason).toBe("Still needed: a SKU with a quantity above zero on each line.");
  const html = renderToStaticMarkup(view);
  const reasonId = html.match(/<p id="([^"]+)"[^>]*>Still needed: a SKU with a quantity above zero on each line\.<\/p>/)?.[1];
  expect(reasonId).toBeTruthy();
  expect(html).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-describedby="${reasonId}"`));
});

it("asks to complete the only row without offering nonexistent clearing or Remove actions", () => {
  const view = render([{ skuId: "sku-1", qty: "" }]).props.children;
  const html = renderToStaticMarkup(view);
  expect(html).toContain("Still needed: a SKU with a quantity above zero on each line.");
  expect(html).not.toContain('clear the line');
  expect(html).not.toContain('remove the line');
  expect(html).not.toContain(">Remove<");
});

it("sends every valid line and ignores only wholly blank spare rows", () => {
  const form = render([complete, { skuId: "", qty: "" }, { skuId: "sku-2", qty: "2.5" }]);
  form.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
  expect(harness.sent).toEqual([expect.objectContaining({ lines: [{ skuId: "sku-1", qty: 12 }, { skuId: "sku-2", qty: 2.5 }] })]);
});

it.each(["wholesale", "taproom_transfer"] as const)("keeps untouched blank lines quiet for %s", kind => {
  const html = renderToStaticMarkup(render([{ skuId: "", qty: "" }], kind).props.children);
  expect(html).not.toMatch(/Line 1:|aria-invalid="true"/);
});

it("shows one setup message and keeps saving disabled on an empty catalog", () => {
  const form = render([{ skuId: "", qty: "" }], "wholesale", true);
  const html = renderToStaticMarkup(form);
  expect(html).toContain("Before creating an order, add a customer and a SKU.");
  expect(html).not.toContain("Still needed:");
  expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  expect(html).toContain('href="/customers"');
  expect(html).toContain('href="/catalog"');
  form.props.onSubmit({ preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as FormEvent);
  expect(harness.sent).toEqual([]);
});

it("asks for a destination location in sentence case", () => {
  expect(render([complete], "taproom_transfer").props.children.props.reason).toBe("Still needed: a destination location.");
});

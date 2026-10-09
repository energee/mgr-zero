// tests/order-cancel-dialog.test.ts — #768: the shared Cancel order dialog
// (cancel-order-dialog.tsx), as mounted by the Confirm order review, shows
// cancel_order's error inside the dialog, labels its busy state, and resets the
// reason and error on close. Complete batch
// says why it is disabled when no batch is open.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const action = { busy: false, error: null as string | null, setError: vi.fn(), run: vi.fn() };
let form: { open: boolean; onOpenChange: (open: boolean) => void; children: unknown };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/lib/brewery-provider", () => ({ useBrewery: () => "b", useCommandContext: () => ({ actorId: "a", breweryId: "b" }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));
vi.mock("@/components/mgr/command-form", async (original) => {
  const real = await original<typeof import("@/components/mgr/command-form")>();
  return { ...real, CommandForm: (props: typeof form & { trigger: unknown }) => { form = props; return createElement("div", { "data-dialog": true }, props.trigger as never, props.children as never); } };
});
import { ConfirmButtons } from "@/app/(app)/orders/[id]/confirm/confirm-buttons";
import { BatchCompletionForm } from "@/app/(app)/cellar/batch-completion-form";

beforeEach(() => { action.busy = false; action.error = null; action.setError.mockClear(); });

it("renders the cancel error inside the dialog, not only behind it", () => {
  action.error = "Order already shipped";
  const html = renderToStaticMarkup(createElement(ConfirmButtons, { orderId: "o", lines: [] }));
  const dialog = html.slice(html.indexOf("data-dialog"));
  expect(dialog).toContain("Order already shipped");
});

it("labels the cancel submit while it runs", () => {
  action.busy = true;
  const html = renderToStaticMarkup(createElement(ConfirmButtons, { orderId: "o", lines: [] }));
  expect(html).toContain("Cancelling…");
});

it("clears the error when the dialog closes, and a stale confirm error when it opens", () => {
  renderToStaticMarkup(createElement(ConfirmButtons, { orderId: "o", lines: [] }));
  form.onOpenChange(false);
  expect(action.setError).toHaveBeenCalledWith(null);
  action.setError.mockClear();
  form.onOpenChange(true);
  expect(action.setError).toHaveBeenCalledWith(null);
});

it("says why Complete batch is disabled when no batch is open", () => {
  const html = renderToStaticMarkup(createElement(BatchCompletionForm, { batches: [] }));
  expect(html).toContain("No brewed batch is open to complete.");
  expect(renderToStaticMarkup(createElement(BatchCompletionForm, { batches: [{ id: "x", label: "Batch 1" }] }))).not.toContain("No brewed batch is open");
});

// The existing order identity scopes recovery; a failed edit must not block another order.
import { expect, it, vi } from "vitest";
const { run, push } = vi.hoisted(() => ({ run: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => ({ run, busy: false, error: null }) }));
import { EditDraftForm } from "@/app/(app)/orders/[id]/edit-draft-form";
import { EditDraftOrderView } from "@/components/mgr/views/edit-draft-order";
import { editDraftOrder } from "@/lib/mgr/fixtures/edit-draft-order";
it("mounts the shared editor and scopes its command recovery to the saved order", () => {
  const node = EditDraftForm({ orderId: "saved-order", model: editDraftOrder });
  expect(node.type).toBe(EditDraftOrderView);
  const changes = { requestedShipDate: null, poNumber: "PO", lines: [{ skuId: "pils", qty: 2 }] };
  node.props.onSave(changes);
  expect(run).toHaveBeenCalledWith("update_draft_order", { orderId: "saved-order", ...changes }, expect.any(Function), { target: "saved-order" });
});

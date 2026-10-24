import { expect, it, vi } from "vitest";
import "@/lib/commands/transfers";
import TransfersPage from "@/app/(app)/transfers/page";
import { NewTransferForm } from "@/app/(app)/transfers/new-transfer-form";
import { TransfersView } from "@/components/mgr/views/transfers";

const state = vi.hoisted(() => ({ roles: ["sales"] }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", roles: state.roles }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery", roles: state.roles }) }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: async () => [] }));

it.each(["sales", "warehouse", "admin"])("offers transfer creation only when the registered command permits %s", async role => {
  state.roles = [role];
  for (const newTransfer of [undefined, "1"]) {
    const page = await TransfersPage({ searchParams: Promise.resolve({ newTransfer }) });
    expect(page.type).toBe(TransfersView);
    if (role === "sales") {
      expect(page.props.createAction).toBeNull();
    } else {
      expect(page.props.createAction.type).toBe(NewTransferForm);
    }
  }
});

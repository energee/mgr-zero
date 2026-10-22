// Exercises NewTransferForm's success path with mocked router and command hook, without a database.
import { expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ push: vi.fn(), opts: null as null | { onSuccess?: (data: unknown) => void } }));
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(), useState: (initial: unknown) => [initial, vi.fn()] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: harness.push }) }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: (_name: string, opts: { onSuccess?: (data: unknown) => void }) => {
  harness.opts = opts;
  return { open: false, setOpen: vi.fn(), error: null, submitting: false, submit: vi.fn() };
} }));
import { NewTransferForm } from "@/app/(app)/transfers/new-transfer-form";

it("Create transfer opens the new transfer's detail page (#1060)", () => {
  NewTransferForm({ locations: [], bins: [], skus: [] });
  harness.opts?.onSuccess?.({ transferId: "t-1" });
  expect(harness.push).toHaveBeenCalledWith("/transfers/t-1");
});

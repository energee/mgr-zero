import type { StaffRole } from "@/lib/commands/registry";
import { money } from "./money";

export type QboInvoiceAction = "push" | "retry" | "fix_mapping" | "corrected_push" | "repush" | "write_off";

export function qboInvoicePresentation(input: {
  role: StaffRole;
  connected: boolean;
  syncStatus: "pending" | "pushed" | "push_failed";
  hasPendingPush?: boolean;
  syncError?: string | null;
  remoteState?: "live" | "voided" | "deleted";
  balanceCents?: number | null;
  totalCents?: number | null;
  accountantDrift?: boolean;
  writtenOff?: boolean;
  missingMappings?: boolean;
}): { detail: string; actions: QboInvoiceAction[] } {
  if (input.writtenOff) return { detail: "written off in MGR", actions: [] };
  if (input.role === "warehouse" || input.role === "brewer" || input.role === "taproom") {
    return { detail: input.syncStatus === "pushed" ? "QuickBooks status available to Sales" : "not pushed", actions: [] };
  }
  if (!input.connected) return { detail: "QuickBooks connection required", actions: [] };
  if (input.remoteState === "deleted") return { detail: "deleted in QuickBooks", actions: ["repush", ...(input.role === "admin" ? ["write_off" as const] : [])] };
  if (input.remoteState === "voided") return { detail: "voided in QuickBooks · not paid", actions: input.role === "admin" ? ["write_off"] : [] };
  if (input.syncStatus === "push_failed") return {
    detail: `push failed${input.syncError ? ` · ${input.syncError}` : ""}`,
    actions: ["fix_mapping", "corrected_push"],
  };
  if (input.syncStatus === "pending" && input.hasPendingPush) {
    return { detail: "push result unknown · retry uses the same request", actions: ["retry"] };
  }
  if (input.syncStatus === "pending") return input.missingMappings
    ? { detail: "mapping required before push", actions: ["fix_mapping"] }
    : { detail: "ready to push", actions: ["push"] };
  if (input.accountantDrift) return { detail: "edited in QuickBooks · review there", actions: [] };
  if (input.balanceCents === 0) return { detail: "paid in QuickBooks", actions: [] };
  if (typeof input.balanceCents === "number" && typeof input.totalCents === "number" && input.balanceCents < input.totalCents) {
    return { detail: `partially paid in QuickBooks · ${money(input.balanceCents)} due`, actions: [] };
  }
  if (typeof input.balanceCents === "number") return { detail: `${input.balanceCents > 0 ? "balance due" : "current"} in QuickBooks`, actions: [] };
  return { detail: "pushed to QuickBooks", actions: [] };
}

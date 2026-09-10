import type { StaffRole } from "@/lib/commands/registry";
import { money } from "./money";

export type QboInvoiceAction = "push" | "retry" | "fix_mapping" | "corrected_push" | "repush" | "write_off";
export type QboRemoteCreateAction = Extract<QboInvoiceAction, "push" | "retry" | "corrected_push" | "repush">;

export function qboPushConfirmation(action: QboRemoteCreateAction, invoiceLabel: string) {
  if (action === "retry") return {
    title: `Retry ${invoiceLabel} in QuickBooks?`,
    detail: `MGR will resend the exact saved request for ${invoiceLabel}. It will not rebuild the invoice.`,
    confirmLabel: "Confirm exact retry",
  };
  if (action === "corrected_push") return {
    title: `Push corrected ${invoiceLabel} to QuickBooks?`,
    detail: `MGR will create a corrected QuickBooks attempt for ${invoiceLabel} after the rejected mapping was fixed.`,
    confirmLabel: "Confirm corrected push",
  };
  if (action === "repush") return {
    title: `Re-push deleted ${invoiceLabel} to QuickBooks?`,
    detail: `MGR will create ${invoiceLabel} again because sync confirmed the prior QuickBooks document was deleted.`,
    confirmLabel: "Confirm re-push",
  };
  return {
    title: `Push ${invoiceLabel} to QuickBooks?`,
    detail: `MGR will create ${invoiceLabel} in the connected QuickBooks company using its frozen invoice details.`,
    confirmLabel: "Confirm push",
  };
}

export function qboMappingVersion(currentId?: string | null) {
  return `saved:${currentId ?? ""}`;
}

export function qboInvoicePresentation(input: {
  kind: "invoice" | "credit_memo";
  role: StaffRole;
  connected: boolean;
  syncStatus: "pending" | "pushed" | "push_failed";
  hasPendingPush?: boolean;
  syncError?: string | null;
  remoteState?: "live" | "voided" | "deleted";
  balanceCents?: number | null;
  cashCollectedCents?: number | null;
  totalCents?: number | null;
  accountantDrift?: boolean;
  writtenOff?: boolean;
  missingMappings?: boolean;
}): { detail: string; actions: QboInvoiceAction[] } {
  const canWriteOff = input.kind === "invoice" && input.role === "admin";
  if (input.writtenOff) return { detail: "written off in MGR", actions: [] };
  if (input.role === "warehouse" || input.role === "brewer" || input.role === "taproom") {
    return { detail: input.syncStatus === "pushed" ? "QuickBooks status available to Sales" : "not pushed", actions: [] };
  }
  if (input.remoteState === "deleted") return { detail: "deleted in QuickBooks", actions: [
    ...(input.connected ? ["repush" as const] : []),
    ...(canWriteOff ? ["write_off" as const] : []),
  ] };
  if (input.remoteState === "voided") return { detail: "voided in QuickBooks · not paid", actions: canWriteOff ? ["write_off"] : [] };
  if (input.accountantDrift) return { detail: "edited in QuickBooks · review there", actions: [] };
  if (input.syncStatus === "pushed") {
    const cash = input.cashCollectedCents ?? 0;
    if (input.balanceCents === 0) {
      if (cash > 0 && typeof input.totalCents === "number" && cash >= input.totalCents) {
        return { detail: "paid in QuickBooks", actions: [] };
      }
      return { detail: cash > 0
        ? `settled in QuickBooks · ${money(cash)} cash received`
        : "settled in QuickBooks · no cash payment recorded", actions: [] };
    }
    if (typeof input.balanceCents === "number" && typeof input.totalCents === "number" && input.balanceCents < input.totalCents) {
      return { detail: cash > 0
        ? `partially paid in QuickBooks · ${money(cash)} cash received · ${money(input.balanceCents)} due`
        : `${money(input.balanceCents)} due in QuickBooks · no cash payment recorded`, actions: [] };
    }
    if (typeof input.balanceCents === "number") return { detail: `${input.balanceCents > 0 ? "balance due" : "current"} in QuickBooks`, actions: [] };
    return { detail: "pushed to QuickBooks", actions: [] };
  }
  if (!input.connected) {
    if (input.syncStatus === "push_failed") return { detail: `push failed${input.syncError ? ` · ${input.syncError}` : ""} · reconnect QuickBooks to continue`, actions: [] };
    if (input.hasPendingPush) return { detail: "push result unknown · reconnect QuickBooks to retry the exact saved request", actions: [] };
    return { detail: "QuickBooks connection required", actions: [] };
  }
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
  return { detail: "pushed to QuickBooks", actions: [] };
}

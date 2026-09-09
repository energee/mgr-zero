// lib/mgr/transfers-view.ts — view-model for the Transfers list (list_stock_transfers).
import { plural } from "./plural";
import { trfNo } from "./doc-no";

export const TRANSFER_WORK_CHIPS = ["all", "orders", "transfers", "batches", "runs", "POs", "routes"];
export const TRANSFER_WORK_TABS: Record<string, string> = {
  all: "Work", orders: "Orders", transfers: "Transfers", batches: "Batches",
  runs: "Packaging runs", POs: "Purchase orders", routes: "Routes",
};

const VERB: Record<string, { label: string; tone: "info" | "attention" | "success" | "primary" }> = {
  draft: { label: "Submit", tone: "info" },
  submitted: { label: "Pick", tone: "info" },
  picked: { label: "Receive", tone: "success" },
  in_transit: { label: "Receive", tone: "success" },
};

export type TransfersRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  warning: boolean;
};

export type TransfersViewModel = {
  title: string;
  rows: TransfersRowView[];
  empty?: string;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type TransfersRowSnapshot = {
  id: string;
  transfer_no: number | null;
  status: string;
  from_name: string;
  to_name: string;
  line_count: number;
};

export type TransfersSnapshot = {
  transfers: TransfersRowSnapshot[];
  /** Inventory Work list title. Live uses "Transfers". */
  title?: string;
};

export function toTransfersViewProps({ transfers, title }: TransfersSnapshot): TransfersViewModel {
  return {
    title: title ?? "Work",
    empty: transfers.length === 0 ? "No transfers yet" : undefined,
    workChips: TRANSFER_WORK_CHIPS,
    workChipIndex: 2,
    workTabs: TRANSFER_WORK_TABS,
    rows: transfers.map((t) => {
      const verb = VERB[t.status] ?? { label: "Open", tone: "primary" as const };
      const open = t.status !== "received" && t.status !== "cancelled";
      return {
        key: t.id,
        title: trfNo(t.transfer_no),
        detail: `${t.from_name} to ${t.to_name} · ${plural(t.line_count, "line")} · ${t.status.replaceAll("_", " ")}`,
        href: `/transfers/${t.id}`,
        verb: verb.label,
        tone: verb.tone,
        warning: open,
      };
    }),
  };
}

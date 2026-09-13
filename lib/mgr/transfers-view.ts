// lib/mgr/transfers-view.ts — view-model for the Transfers list (list_stock_transfers).
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";
import { trfNo } from "./doc-no";
import { WORK_CHIPS, WORK_TABS } from "./work-view";

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
  empty?: EmptyState;
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
    empty: transfers.length === 0 ? { title: "No transfers yet", description: "A transfer moves stock between two locations." } : undefined,
    workChips: WORK_CHIPS,
    workChipIndex: 2,
    workTabs: WORK_TABS,
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

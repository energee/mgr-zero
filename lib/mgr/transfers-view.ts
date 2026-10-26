// lib/mgr/transfers-view.ts — view-model for the Transfers list (list_stock_transfers).
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";
import { trfNo } from "./doc-no";
import { sentenceCase } from "./labels";
import { WORK_CHIPS, WORK_TABS } from "./work-view";

// A transfer's next action by status. Received and cancelled transfers have
// none: their row is a plain link, because "Open" on a closed record reads as
// reopen (#996, #1026).
const VERB: Record<string, { label: string; tone: "info" | "success" }> = {
  submitted: { label: "Pick", tone: "info" },
  picked: { label: "Receive", tone: "success" },
  in_transit: { label: "Receive", tone: "success" },
};

export type TransfersRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
  verb?: string;
  tone?: "info" | "success";
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
};

export function toTransfersViewProps({ transfers }: TransfersSnapshot): TransfersViewModel {
  return {
    title: "Transfers",
    empty: transfers.length === 0 ? { title: "No transfers yet", description: "A transfer moves stock between two locations." } : undefined,
    workChips: WORK_CHIPS,
    workChipIndex: 2,
    workTabs: WORK_TABS,
    rows: transfers.map((t) => {
      const verb = VERB[t.status];
      const open = t.status !== "received" && t.status !== "cancelled";
      return {
        key: t.id,
        title: trfNo(t.transfer_no),
        detail: `${t.from_name} to ${t.to_name} · ${plural(t.line_count, "line")} · ${sentenceCase(t.status)}`,
        href: `/transfers/${t.id}`,
        verb: verb?.label,
        tone: verb?.tone,
        warning: open,
      };
    }),
  };
}

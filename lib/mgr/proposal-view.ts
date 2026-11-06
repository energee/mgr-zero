// lib/mgr/proposal-view.ts — what a person sees when approving an agent's proposed
// change. Pure: the pages supply the proposal, its labelled fields and the agent's name.
import { sentenceCase } from "@/lib/mgr/labels";
import type { ProposalRow } from "@/lib/mgr/proposal-labels";

const CLOSED_NOTES: Record<string, string> = {
  expired: "This request has expired. Ask your agent to propose it again.",
  declined: "You declined this change.",
  committed: "Approved and saved.",
  approved: "This change was approved, but its result is unknown. Check the record before trying again.",
};

function fieldLabel(field: string) {
  const words = field.replace(/\[(\d+)\]/g, (_, index: string) => ` ${Number(index) + 1} `).replace(/[._]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim().toLowerCase();
  return sentenceCase(words.replace(/ id$/, ""));
}

function fieldValue({ value, unit }: ProposalRow) {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return unit ? `${String(value)} ${unit}` : String(value);
}

export type ProposalViewModel = {
  agentName: string;
  description: string;
  undo: string;
  rows: { label: string; value: string }[];
  canDecide: boolean;
  note: { text: string; role: "note" | "alert" } | null;
};

function noteFor(status: string, failure: string | null, hasWarning: boolean): ProposalViewModel["note"] {
  if (status === "failed") return { text: `This change was not saved. ${failure}`, role: "alert" };
  if (status !== "pending") return { text: CLOSED_NOTES[status], role: "note" };
  return hasWarning ? { text: "Some records could not be named. Check them before you approve.", role: "alert" } : null;
}

export function toProposalViewProps({ agentName, description, undo, status, failure, rows }: {
  agentName: string; description: string; undo: string; status: string; failure: string | null; rows: ProposalRow[];
}): ProposalViewModel {
  return {
    agentName, description,
    // compensation text is written for agents, so it names commands like delete_bin.
    undo: undo.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, name => name.replaceAll("_", " ")),
    rows: rows.map(row => ({ label: fieldLabel(row.field), value: fieldValue(row) })),
    canDecide: status === "pending",
    note: noteFor(status, failure, rows.some(row => row.warning)),
  };
}

export function toProposalListRows(proposals: { id: string; agentName: string; description: string }[]) {
  return proposals.map(({ id, agentName, description }) => ({ id, title: description, detail: `From ${agentName}`, href: `/proposals/${id}` }));
}

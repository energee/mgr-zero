// components/mgr/views/proposal.tsx — one change an agent proposed: what it does,
// its fields by name, how to undo it, and the person's decision.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ProposalViewModel } from "@/lib/mgr/proposal-view";

export function ProposalView({ model, actions, backHref }: { model: ProposalViewModel; actions?: ReactNode; backHref?: string }) {
  return <>
    {E.back("Changes to approve", "Review change", undefined, backHref)}
    {E.row(model.description, `Proposed by ${model.agentName}`)}
    {model.note && E.note(model.note.text, model.note.role)}
    {model.rows.map(row => <div key={row.label}>{E.row(row.label, row.value)}</div>)}
    {E.row("If this is wrong", model.undo)}
    {model.canDecide && (actions ?? E.btns([["Approve", "p"], ["Decline", "g"]]))}
  </>;
}

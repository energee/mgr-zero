// app/(app)/proposals/[id]/proposal-actions.tsx — the person's decision on one
// proposal. Approve runs the change as them; the page refreshes to show the result.
"use client";

import { E } from "@/components/mgr/e";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function ProposalActions({ proposalId }: { proposalId: string }) {
  const { busy, error, run } = useCommandAction();
  const kind = (base: "p" | "g") => (busy ? `${base} disabled` as const : base);
  return <>
    <CommandFormFooter>
      {E.btn("Approve", kind("p"), undefined, () => void run("approve_agent_proposal", { proposalId }))}
      {E.btn("Decline", kind("g"), undefined, () => void run("decline_agent_proposal", { proposalId }))}
    </CommandFormFooter>
    <CommandFormMessage error={error} />
  </>;
}

// app/(app)/proposals/[id]/page.tsx — one change an agent proposed. approveUrl points
// here. Only the person the agent acts for can read it, by RLS.
import { cache } from "react";
import { ProposalView } from "@/components/mgr/views/proposal";
import { agentNames } from "@/lib/agent/agent-names";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { labelProposal } from "@/lib/mgr/proposal-labels";
import { toProposalViewProps } from "@/lib/mgr/proposal-view";
import { ProposalActions } from "./proposal-actions";

type Proposal = { command: string; input: unknown; clientId: string; status: string; failure: string | null };

const getProposalPageData = cache(async function getProposalPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const proposal = await orNotFound(runCommand("get_proposal_status", { proposalId: id }, ctx)) as Proposal;
  return { ctx, proposal };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getProposalPageData(id);
  return { title: "Review change" };
}

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, proposal } = await getProposalPageData(id);
  const [rows, nameOf] = await Promise.all([labelProposal(ctx, proposal.command, proposal.input), agentNames()]);
  const definition = getCommandDefinition(proposal.command);
  const model = toProposalViewProps({
    agentName: nameOf(proposal.clientId), status: proposal.status, failure: proposal.failure, rows,
    description: definition?.description ?? proposal.command, undo: definition?.compensation ?? "This agent did not say how to undo it.",
  });
  return <ProposalView model={model} backHref="/proposals" actions={<ProposalActions proposalId={id} />} />;
}

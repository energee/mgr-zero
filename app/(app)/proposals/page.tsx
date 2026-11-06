// app/(app)/proposals/page.tsx — the changes this person's agents proposed that are
// still waiting. Reached from Today and from Me → Agents.
import { ProposalsView } from "@/components/mgr/views/proposals";
import { agentNames } from "@/lib/agent/agent-names";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toProposalListRows } from "@/lib/mgr/proposal-view";

export const metadata = { title: navTitle("/proposals") };

export default async function ProposalsPage() {
  const brewery = await getActiveBrewery();
  const [proposals, nameOf] = await Promise.all([
    buildContext(brewery.id).then(ctx => runCommand("list_agent_proposals", {}, ctx) as Promise<{ id: string; client_id: string; command: string }[]>),
    agentNames(),
  ]);
  return <ProposalsView backHref="/" rows={toProposalListRows(proposals.map(({ id, client_id, command }) => ({
    id, agentName: nameOf(client_id), description: getCommandDefinition(command)?.description ?? command,
  })))} />;
}

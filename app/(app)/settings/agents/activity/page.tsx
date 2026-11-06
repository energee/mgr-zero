// app/(app)/settings/agents/activity/page.tsx — what models did at this brewery. Admins
// only: the query's role and the log's RLS both enforce it.
import { AgentActivityView } from "@/components/mgr/views/agent-activity";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import "@/lib/commands/all";
import { type AgentSession, toAgentSessionRows } from "@/lib/mgr/agent-activity-view";
import { navTitle } from "@/lib/mgr/nav";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";

export const metadata = { title: navTitle("/settings/agents/activity") };

export default async function AgentActivityPage() {
  const brewery = await getActiveBrewery();
  const sessions = await runCommand("list_agent_sessions", {}, await buildContext(brewery.id)) as AgentSession[];
  return <AgentActivityView backHref="/settings" rows={toAgentSessionRows(sessions, brewery.timeZone)} />;
}

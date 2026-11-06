// app/(app)/settings/agents/activity/[id]/page.tsx — one session's steps and notes.
import { cache } from "react";
import { AgentSessionView } from "@/components/mgr/views/agent-activity";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import "@/lib/commands/all";
import { type AgentSessionDetail, toAgentSessionViewProps } from "@/lib/mgr/agent-activity-view";
import { orNotFound } from "@/lib/mgr/not-found";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";

const getAgentSessionPageData = cache(async function getAgentSessionPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const session = await orNotFound(runCommand("get_agent_session", { sessionId: id }, ctx)) as AgentSessionDetail;
  return { brewery, session };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getAgentSessionPageData(id);
  return { title: "Agent session" };
}

export default async function AgentSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, session } = await getAgentSessionPageData(id);
  return <AgentSessionView backHref="/settings/agents/activity" model={toAgentSessionViewProps(session, brewery.timeZone)} />;
}

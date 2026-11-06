// components/mgr/views/agent-activity.tsx — what models did at this brewery: the list of
// sessions, and one session's steps and notes. A note is text a model wrote, so it is
// always shown under the agent's name.
import { E } from "@/components/mgr/e";
import type { toAgentSessionViewProps } from "@/lib/mgr/agent-activity-view";

export function AgentActivityView({ rows, backHref }: {
  rows: { id: string; title: string; detail: string; href?: string }[];
  backHref?: string;
}) {
  return <>
    {E.back("Settings", "Agent activity", undefined, backHref)}
    {E.info("What agents and Ask MGR did here. It records names and outcomes, never what was read or typed, and lasts 90 days.")}
    {rows.length
      ? rows.map(row => <div key={row.id}>{E.nav(row.title, row.detail, "", undefined, row.href, "Agent session")}</div>)
      : E.blank("No agent activity yet.")}
  </>;
}

export function AgentSessionView({ model, backHref }: { model: ReturnType<typeof toAgentSessionViewProps>; backHref?: string }) {
  return <>
    {E.back("Agent activity", "Agent session", undefined, backHref)}
    {E.row(model.agent, model.detail)}
    {model.notes.map(note => <div key={note.id}>{E.row(note.title, note.text)}</div>)}
    {model.steps.map((step, index) => <div key={index}>{E.row(step.title, step.detail)}</div>)}
  </>;
}

// lib/mgr/agent-activity-view.ts — how an Admin reads the log of what models did. Pure:
// the pages supply the sessions. A step holds names and codes, never values.
import { formatDate } from "@/lib/date-format";
import { plural } from "@/lib/mgr/plural";

export type AgentSession = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  person: string;
  lastSeenAt: string;
  steps: number;
  problems: number;
  notes: number;
};

type StepRow = { tool: string; operation: string | null; outcome: string; error_code: string | null; input_path: string | null };
type NoteRow = { id: string; kind: string; body: string };
export type AgentSessionDetail = AgentSession & { stepRows: StepRow[]; noteRows: NoteRow[] };

/** A null client is Ask MGR. A client with no name was removed, or never gave one. */
function agentName({ clientId, clientName }: Pick<AgentSession, "clientId" | "clientName">) {
  if (clientId === null) return "Ask MGR";
  return clientName || "A removed agent";
}

export function toAgentSessionRows(sessions: AgentSession[], timeZone: string) {
  return sessions.map(session => {
    const parts = [session.person, plural(session.steps, "step")];
    if (session.problems > 0) parts.push(plural(session.problems, "problem"));
    parts.push(formatDate(session.lastSeenAt, timeZone));
    return {
      id: session.id,
      title: agentName(session),
      detail: parts.join(" · "),
      href: `/settings/agents/activity/${session.id}`,
    };
  });
}

function stepResult({ outcome, error_code, input_path }: StepRow) {
  if (outcome === "ok") return "Done";
  if (outcome === "failed") return "Failed";
  const where = input_path ? ` at ${input_path}` : "";
  return `Refused: ${error_code}${where}`;
}

export function toAgentSessionViewProps(session: AgentSessionDetail, timeZone: string) {
  const agent = agentName(session);
  return {
    agent,
    detail: `${session.person} · ${formatDate(session.lastSeenAt, timeZone)}`,
    steps: session.stepRows.map(step => ({ title: step.operation ?? step.tool, detail: stepResult(step) })),
    notes: session.noteRows.map(({ id, kind, body }) => ({
      id, title: `${kind === "friction" ? "Friction" : "Handoff"} note from ${agent}`, text: body,
    })),
  };
}

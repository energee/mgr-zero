// lib/agent/friction.ts — renders the weekly report on where models get stuck. It lands in
// a public GitHub issue, so it holds only names, codes, paths and counts.
export type FrictionReport = {
  operations: { name: string; calls: number; refused: number; failed: number }[];
  errors: { name: string; code: string; count: number }[];
  paths: { name: string; path: string; count: number }[];
  proposals: { status: string; count: number }[];
  clients: { clientId: string | null; clientName: string | null; sessions: number }[];
};

/** Logged when a step names no operation. MCP and Ask MGR share these tool names. */
const TOOLS = new Set(["describe_operation", "find_operations", "get_started", "leave_note", "propose_command", "run_query", "search_guide"]);

/** A client picks its own name, so only plain characters reach the issue. */
function clientLabel({ clientId, clientName }: FrictionReport["clients"][number]) {
  if (clientId === null) return "Ask MGR";
  return clientName?.replace(/[^A-Za-z0-9 ._-]/g, "").trim().slice(0, 40) || "A removed agent";
}

function table(heading: string, columns: string[], rows: (string | number)[][]) {
  if (rows.length === 0) return [];
  return [
    `## ${heading}`, "",
    `| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.join(" | ")} |`), "",
  ];
}

/**
 * `isOperation` says whether MGR registers a name. A token can log any identifier-shaped
 * name by calling the RPC itself, so an unknown one shows as "other", and so does its path.
 * ponytail: a code or path on a known operation can still be forged; a server-side writer
 * would close that if this report is ever abused.
 */
export function renderFrictionReport(report: FrictionReport, isOperation: (name: string) => boolean): string {
  const shown = (name: string) => (TOOLS.has(name) || isOperation(name) ? name : "other");
  const intro = "Where models got stuck in MGR over the last 7 days. Each run replaces this report.";
  if (report.operations.length === 0) return `${intro}\n\nNo agent activity in the last 7 days.\n`;
  return [
    intro, "",
    ...table("Operations", ["Operation", "Calls", "Refused", "Failed"], report.operations.map(row => [shown(row.name), row.calls, row.refused, row.failed])),
    ...table("Error codes", ["Operation", "Code", "Count"], report.errors.map(row => [shown(row.name), shown(row.name) === "other" ? "other" : row.code, row.count])),
    ...table("Input paths that fail", ["Operation", "Path", "Count"], report.paths.map(row => [shown(row.name), shown(row.name) === "other" ? "other" : row.path, row.count])),
    ...table("Proposals", ["Status", "Count"], report.proposals.map(row => [row.status, row.count])),
    ...table("Clients", ["Client", "Sessions"], report.clients.map(row => [clientLabel(row), row.sessions])),
  ].join("\n");
}

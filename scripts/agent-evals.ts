// scripts/agent-evals.ts — the agent evals in docs/plans/agent-access.md, task 11.
// --dry-run validates every case and prints what would run. It sends nothing.
// --live always refuses until model credits are decided (#329). lib/mgr/agent-eval-run.ts
// is the runner it will use, proved offline with a scripted model.
//   bun scripts/agent-evals.ts --dry-run
import "@/lib/commands/all";
import { readFile } from "node:fs/promises";
import { canRun, listTools, STAFF_ROLES, type Ctx } from "@/lib/commands/registry";
import { caseProblems, evalCaseSchema, type EvalCase, type Operations } from "@/lib/mgr/agent-eval-score";
import { leafFields } from "@/lib/mgr/api-schema";

/**
 * The registry as the scorer needs it. A hidden operation is past every role.
 * canRun reads only the roles and whether a brewery is set, so any brewery id will do.
 */
function agentOperations(): Operations {
  return new Map(listTools().map(tool => [tool.name, {
    kind: tool.kind,
    roles: tool.agentHidden ? [] : STAFF_ROLES.filter(role => canRun({ breweryId: "eval", roles: [role] } as unknown as Ctx, tool.name)),
    fields: leafFields(tool.inputSchema).map(field => field.name),
  }]));
}

/**
 * What one run would send. The agent gets only `request`, never the expectation.
 * Reversed order flips the judge's labels here.
 * runEvalCase flips the tool list. The prompt has no options to flip.
 * The two runs of a case can differ by chance, so a change is a flag, not proof of an order effect.
 */
function buildRun({ expectation, id, prompt, role }: EvalCase, reversed: boolean) {
  const options = "labels" in expectation ? Object.entries(expectation.labels.options) : null;
  return {
    type: "request",
    caseId: id,
    order: reversed ? "reversed" : "normal",
    request: { role, prompt },
    judgeLabels: options && Object.fromEntries(reversed ? options.reverse() : options),
  };
}

function print(value: unknown): void {
  console.log(JSON.stringify(value));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--live"].includes(args[0])) {
    throw new Error("Usage: bun scripts/agent-evals.ts --dry-run|--live");
  }
  if (args[0] === "--live") throw new Error("Live evals wait on a decision about model credits (#329). No requests were sent.");
  const fixture = new URL("../tests/fixtures/agent-evals.json", import.meta.url);
  const cases = evalCaseSchema.array().min(1).parse(JSON.parse(await readFile(fixture, "utf8")));
  if (new Set(cases.map(item => item.id)).size !== cases.length) throw new Error("Duplicate case IDs");
  const operations = agentOperations();
  const problems = cases.flatMap(item => caseProblems(item, operations));
  if (problems.length) throw new Error(problems.join("\n"));

  print({
    type: "run", mode: "dry_run", cases: cases.length, requests: cases.length * 2,
    placeholderCases: cases.filter(item => item.source === "author").length,
  });
  for (const item of cases) {
    for (const reversed of [false, true]) print(buildRun(item, reversed));
  }
  print({ type: "dry_run_complete", validatedCases: cases.length, requestsSent: 0, modelResults: null });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

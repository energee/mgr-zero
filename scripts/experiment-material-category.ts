// scripts/experiment-material-category.ts — runs the synthetic material kind cases against a Gateway decision model
// in both criteria orders and prints accuracy, hop recall, order flips, latency and threshold coverage/precision.
// Synthetic cases only: it never reads a database or real brewery data. --dry-run sends nothing.
import { readFile } from "node:fs/promises";
import { experimental_decide } from "ai";
import { z } from "zod";
import { isChatConfigured } from "../lib/env/server-parser";
import { MATERIAL_CATEGORIES } from "../lib/mgr/enums";
import { materialCategoryQuestion, SUGGESTION_MODEL } from "../lib/mgr/material-category-suggestion";

const USAGE = "Usage: bun scripts/experiment-material-category.ts --dry-run|--live [--model <gateway decision model id>]";
const THRESHOLDS = [0.6, 0.7, 0.8, 0.9];
const caseSchema = z.object({ id: z.string().min(1), name: z.string().min(1), expected: z.enum(MATERIAL_CATEGORIES) });
type Case = z.infer<typeof caseSchema>;
type Result = {
  caseId: string;
  order: "normal" | "reversed";
  expected: Case["expected"];
  choice: string;
  probability: number | null;
  probabilities: Record<string, number> | null;
  latencyMs: number;
};

function print(value: unknown): void {
  console.log(JSON.stringify(value));
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function parseArgs(args: string[]): { live: boolean; model: string } {
  const modes = args.filter(arg => arg === "--dry-run" || arg === "--live");
  const rest = args.filter(arg => arg !== "--dry-run" && arg !== "--live");
  const modelOnly = rest.length === 0 || (rest.length === 2 && rest[0] === "--model" && !rest[1].startsWith("--"));
  if (modes.length !== 1 || !modelOnly) throw new Error(USAGE);
  return { live: modes[0] === "--live", model: rest[1] ?? SUGGESTION_MODEL };
}

function summarize(model: string, results: Result[]): void {
  const hops = results.filter(result => result.expected === "hop");
  const flips = results.filter(result => result.order === "normal").filter(result =>
    results.find(other => other.caseId === result.caseId && other.order === "reversed")?.choice !== result.choice);
  print({
    type: "summary", model, decisions: results.length,
    accuracy: results.filter(result => result.choice === result.expected).length / results.length,
    hopRecall: hops.filter(result => result.choice === "hop").length / hops.length,
    optionOrderChanges: flips.map(result => result.caseId),
    latencyP50Ms: percentile(results.map(result => result.latencyMs), 0.5),
    latencyP95Ms: percentile(results.map(result => result.latencyMs), 0.95),
    thresholds: THRESHOLDS.map(min => {
      const shown = results.filter(result => result.probability !== null && result.probability >= min);
      return {
        min,
        coverage: shown.length / results.length,
        precision: shown.length === 0 ? null : shown.filter(result => result.choice === result.expected).length / shown.length,
      };
    }),
  });
}

async function main(): Promise<void> {
  const { live, model } = parseArgs(process.argv.slice(2));
  const cases = z.array(caseSchema).min(1).parse(JSON.parse(await readFile(new URL("./material-category-cases.json", import.meta.url), "utf8")));
  if (new Set(cases.map(item => item.id)).size !== cases.length) throw new Error("Duplicate case IDs");
  if (live && !isChatConfigured()) throw new Error("Live experiment requires AI Gateway credentials. No requests were sent.");
  print({ type: "run", mode: live ? "live" : "dry_run", model, cases: cases.length, requests: cases.length * 2, syntheticOnly: true });
  const results: Result[] = [];
  for (const item of cases) {
    for (const reversed of [false, true]) {
      const order = reversed ? "reversed" : "normal";
      const request = { model, state: { materialName: item.name }, questions: { category: materialCategoryQuestion(reversed) } };
      print({ type: "request", caseId: item.id, order, request });
      if (!live) continue;
      const started = performance.now();
      const { answers } = await experimental_decide({ ...request, maxRetries: 0, abortSignal: AbortSignal.timeout(30_000) });
      const answer = answers.category;
      const result: Result = {
        caseId: item.id, order, expected: item.expected, choice: answer.choice,
        probability: answer.probabilities?.[answer.choice] ?? null,
        probabilities: answer.probabilities ?? null,
        latencyMs: Math.round(performance.now() - started),
      };
      results.push(result);
      print({ type: "result", ...result });
    }
  }
  if (live) summarize(model, results);
  else print({ type: "dry_run_complete", validatedCases: cases.length, requestsSent: 0 });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

// scripts/experiment-material-category.ts — runs the synthetic material kind cases against a decision model (TypeSafe or Gateway)
// in both criteria orders and prints accuracy, per-kind recall, order flips, latency, threshold coverage/precision,
// and how the free keyword lookup (material-category-keywords.ts) does on the same names.
// Synthetic cases only: it never reads a database or real brewery data. --dry-run sends nothing.
import { readFile } from "node:fs/promises";
import { experimental_decide } from "ai";
import { z } from "zod";
import { MATERIAL_CATEGORIES } from "../lib/mgr/enums";
import { isDecisionModelConfigured, MATERIAL_CATEGORY_MIN_PROBABILITY, materialCategoryQuestion, resolveDecisionModel, SUGGESTION_MODEL } from "../lib/mgr/material-category-suggestion";
import { keywordMaterialCategory } from "./material-category-keywords";

const USAGE = "Usage: bun scripts/experiment-material-category.ts --dry-run|--live [--model <typesafe:model or gateway decision model id>] [--cases <file in scripts/>]";
const THRESHOLDS = [0.8, 0.9, 0.95];
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

function parseArgs(args: string[]): { live: boolean; model: string; casesFile: string } {
  const modes = args.filter(arg => arg === "--dry-run" || arg === "--live");
  const rest = args.filter(arg => arg !== "--dry-run" && arg !== "--live");
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (!["--model", "--cases"].includes(flag) || options.has(flag) || !value || value.startsWith("--")) throw new Error(USAGE);
    options.set(flag, value);
  }
  if (modes.length !== 1) throw new Error(USAGE);
  return {
    live: modes[0] === "--live",
    model: options.get("--model") ?? SUGGESTION_MODEL,
    casesFile: options.get("--cases") ?? "material-category-cases.json",
  };
}

/** The keyword lookup's coverage (share of names it answers) and precision (share of those answers that are right). */
function baseline(cases: Case[]) {
  const answered = cases.filter(item => keywordMaterialCategory(item.name) !== null);
  return {
    type: "baseline", names: cases.length,
    coverage: answered.length / cases.length,
    precision: answered.length === 0 ? null : answered.filter(item => keywordMaterialCategory(item.name) === item.expected).length / answered.length,
  };
}

const shownRight = (result: Result | undefined) =>
  result !== undefined && result.choice === result.expected && (result.probability ?? 0) >= MATERIAL_CATEGORY_MIN_PROBABILITY;

/** Names Jev gets right and shows at the product threshold, in the product's (normal) order, against names the keyword
 *  lookup gets right. */
function headToHead(cases: Case[], results: Result[]) {
  const jevRight = new Set(cases.filter(item =>
    shownRight(results.find(result => result.caseId === item.id && result.order === "normal"))).map(item => item.id));
  const keywordRight = new Set(cases.filter(item => keywordMaterialCategory(item.name) === item.expected).map(item => item.id));
  return {
    min: MATERIAL_CATEGORY_MIN_PROBABILITY,
    jevOnly: [...jevRight].filter(id => !keywordRight.has(id)),
    keywordOnly: [...keywordRight].filter(id => !jevRight.has(id)),
    both: [...jevRight].filter(id => keywordRight.has(id)).length,
  };
}

function summarize(model: string, cases: Case[], results: Result[]): void {
  const flips = results.filter(result => result.order === "normal").filter(result =>
    results.find(other => other.caseId === result.caseId && other.order === "reversed")?.choice !== result.choice);
  print({
    type: "summary", model, decisions: results.length,
    accuracy: results.filter(result => result.choice === result.expected).length / results.length,
    recallByKind: Object.fromEntries(MATERIAL_CATEGORIES.map(kind => {
      const ofKind = results.filter(result => result.expected === kind);
      return [kind, ofKind.length === 0 ? null : ofKind.filter(result => result.choice === kind).length / ofKind.length];
    })),
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
    shownWrong: results.filter(result => result.choice !== result.expected && (result.probability ?? 0) >= MATERIAL_CATEGORY_MIN_PROBABILITY)
      .map(({ caseId, order, expected, choice, probability }) => ({ caseId, order, expected, choice, probability })),
    headToHead: headToHead(cases, results),
  });
}

async function main(): Promise<void> {
  const { live, model, casesFile } = parseArgs(process.argv.slice(2));
  // A file beside this script, such as material-category-holdout.json.
  const cases = z.array(caseSchema).min(1).parse(JSON.parse(await readFile(new URL(`./${casesFile}`, import.meta.url), "utf8")));
  if (new Set(cases.map(item => item.id)).size !== cases.length) throw new Error("Duplicate case IDs");
  if (live && !isDecisionModelConfigured(model)) throw new Error(`Live experiment requires credentials for ${model}. No requests were sent.`);
  print({ type: "run", mode: live ? "live" : "dry_run", model, cases: cases.length, requests: cases.length * 2, syntheticOnly: true });
  print(baseline(cases));
  const results: Result[] = [];
  for (const item of cases) {
    for (const reversed of [false, true]) {
      const order = reversed ? "reversed" : "normal";
      const request = { model, state: { materialName: item.name }, questions: { category: materialCategoryQuestion(reversed) } };
      print({ type: "request", caseId: item.id, order, request });
      if (!live) continue;
      const started = performance.now();
      const { answers } = await experimental_decide({ ...request, model: resolveDecisionModel(model, process.env.TYPESAFE_API_KEY), maxRetries: 0, abortSignal: AbortSignal.timeout(30_000) });
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
  if (live) summarize(model, cases, results);
  else print({ type: "dry_run_complete", validatedCases: cases.length, requestsSent: 0 });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

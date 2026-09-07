// scripts/pr-directives.ts — structured lines in a PR description that
// workflows act on without a model:
//
//   TODO: <text>   the open TODO.md item this PR finishes (unique substring)
//   DOCS: none     the documentation agent has nothing to do for this PR
//
// `bun scripts/pr-directives.ts check` validates $PR_BODY against TODO.md (CI,
// on every pull request). `bun scripts/pr-directives.ts todo <base> <head>`
// moves the items named by PRs merged in base..head out of TODO.md and onto
// the top of .agents/PROGRESS.md's Done log (dreaming workflow, before the
// agent runs). Pure helpers are exported for
// tests/pr-directives.test.ts.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

export type Directives = { todo: string[]; docs: string | null };

export function parseDirectives(body: string): Directives {
  const todo = [...body.matchAll(/^TODO:[ \t]*(.+?)[ \t]*$/gm)].map((m) => m[1]);
  const docs = body.match(/^DOCS:[ \t]*(.+?)[ \t]*$/m)?.[1] ?? null;
  return { todo, docs };
}

/** Open checklist lines, in order. */
export function openItems(todo: string): string[] {
  return [...todo.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]);
}

export function matchItem(items: string[], target: string): string[] {
  const t = target.toLowerCase();
  return items.filter((i) => i.toLowerCase().includes(t));
}

/** Errors, empty when the body's directives are all well-formed against this TODO.md. */
export function check(todo: string, body: string): string[] {
  const { todo: targets, docs } = parseDirectives(body);
  const items = openItems(todo);
  const errors: string[] = [];
  for (const t of targets) {
    const hits = matchItem(items, t);
    if (hits.length !== 1) errors.push(`TODO: ${t} matches ${hits.length} open items in TODO.md${hits.length ? `: ${hits.join(" | ")}` : ""}`);
  }
  if (docs !== null && docs !== "none") errors.push(`DOCS: ${docs} — only "none" is understood`);
  return errors;
}

/** The item matching `target` removed from TODO.md and logged at the top of PROGRESS.md's Done. */
export function moveDone(todo: string, progress: string, target: string, date: string, pr: number): { todo: string; progress: string } {
  const [hit, ...rest] = matchItem(openItems(todo), target);
  if (!hit || rest.length) throw new Error(`TODO: ${target} matches ${rest.length + (hit ? 1 : 0)} open items`);
  if (!/^## Done\n/m.test(progress)) throw new Error("PROGRESS.md has no ## Done section");
  return {
    todo: todo.replace(`- [ ] ${hit}\n`, ""),
    progress: progress.replace(/^## Done\n/m, `## Done\n- ${date} — ${hit} (#${pr})\n`),
  };
}

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf8" });

// vitest imports the helpers; only a direct run reaches the CLI.
if (process.argv[1]?.endsWith("pr-directives.ts")) {
  const [mode, base, head] = process.argv.slice(2);
  const todo = readFileSync("TODO.md", "utf8");
  const progress = readFileSync(".agents/PROGRESS.md", "utf8");
  if (mode === "check") {
    const errors = check(todo, process.env.PR_BODY ?? "");
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(errors.length ? 1 : 0);
  } else if (mode === "todo" && base && head) {
    const prs = [...sh("git", ["log", `${base}..${head}`, "--format=%s"]).matchAll(/\(#(\d+)\)$/gm)].map((m) => Number(m[1]));
    let next = { todo, progress };
    for (const pr of prs) {
      const body = sh("gh", ["pr", "view", String(pr), "--json", "body", "--jq", ".body"]);
      for (const target of parseDirectives(body).todo) {
        try {
          next = moveDone(next.todo, next.progress, target, new Date().toISOString().slice(0, 10), pr);
          console.log(`#${pr}: moved "${target}" to Done`);
        } catch (e) {
          console.log(`::warning::#${pr}: ${(e as Error).message}`); // already moved, or a stale marker
        }
      }
    }
    if (next.todo !== todo) {
      writeFileSync("TODO.md", next.todo);
      writeFileSync(".agents/PROGRESS.md", next.progress);
    }
  } else {
    console.error("usage: pr-directives.ts check | todo <base> <head>");
    process.exit(2);
  }
}

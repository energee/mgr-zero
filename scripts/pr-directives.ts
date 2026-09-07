// scripts/pr-directives.ts — CLI over lib/pr-directives.ts.
//
// `check`: validate $PR_BODY against TODO.md (ci.yml, every pull request).
// `todo <base> <head>`: for PRs merged into base..head whose body carries
// `TODO: <text>`, move that item out of TODO.md onto PROGRESS.md's Done
// (dreaming.yml, before the agent runs).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { check, moveDone, parseTodoTargets } from "@/lib/pr-directives";

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: "utf8" });
const [mode, base, head] = process.argv.slice(2);
const todo = readFileSync("TODO.md", "utf8");

if (mode === "check") {
  const errors = check(todo, process.env.PR_BODY ?? "");
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(errors.length ? 1 : 0);
} else if (mode === "todo" && base && head) {
  const progress = readFileSync(".agents/PROGRESS.md", "utf8");
  // One listing, filtered to merge commits inside the window; no commit-subject parsing.
  const inWindow = new Set(sh("git", ["rev-list", `${base}..${head}`]).split("\n"));
  const merged = JSON.parse(sh("gh", ["pr", "list", "--state", "merged", "--base", "main", "--limit", "100", "--json", "number,body,mergeCommit"])) as { number: number; body: string; mergeCommit: { oid: string } | null }[];
  let next = { todo, progress };
  for (const pr of merged) {
    if (!pr.mergeCommit || !inWindow.has(pr.mergeCommit.oid)) continue;
    for (const target of parseTodoTargets(pr.body)) {
      try {
        next = moveDone(next.todo, next.progress, target, new Date().toISOString().slice(0, 10), pr.number);
        console.log(`#${pr.number}: moved "${target}" to Done`);
      } catch (e) {
        console.log(`::warning::#${pr.number}: ${(e as Error).message}`); // already moved, or a stale marker
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

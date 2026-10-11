// lib/pr-directives.ts — the pure half of the PR-description directives that
// workflows act on without a model (scripts/pr-directives.ts is the CLI):
//
//   TODO: <text>   the open TODO.md item this PR finishes (unique substring)
//   DOCS: none     the documentation agent has nothing to do for this PR
//                  (matched by the workflow with a plain substring test, so
//                  write exactly that; nothing here parses it)
//
// dropClosed also retires TODO.md items whose linked issue closed as completed,
// so an issue closed without a `TODO:` line does not leave its item behind.

export const parseTodoTargets = (body: string): string[] =>
  [...body.matchAll(/^TODO:[ \t]*(.+?)[ \t]*$/gm)].map((m) => m[1]);

/** Open checklist lines, in order. */
export const openItems = (todo: string): string[] =>
  [...todo.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]);

const matchItem = (todo: string, target: string) => {
  const hits = openItems(todo).filter((i) => i.toLowerCase().includes(target.toLowerCase()));
  return hits.length === 1 ? hits[0] : new Error(`TODO: ${target} matches ${hits.length} open items in TODO.md${hits.length ? `: ${hits.join(" | ")}` : ""}`);
};

/** Errors, empty when every `TODO:` line names exactly one open item. */
export const check = (todo: string, body: string): string[] =>
  parseTodoTargets(body).map((t) => matchItem(todo, t)).filter((r) => r instanceof Error).map((e) => e.message);

/** The item matching `target` removed from TODO.md and logged at the top of PROGRESS.md's Done. */
export function moveDone(todo: string, progress: string, target: string, date: string, pr: number): { todo: string; progress: string } {
  const hit = matchItem(todo, target);
  if (hit instanceof Error) throw hit;
  if (!/^## Done\n/m.test(progress)) throw new Error("PROGRESS.md has no ## Done section");
  return {
    todo: todo.replace(`- [ ] ${hit}\n`, ""),
    progress: progress.replace(/^## Done\n/m, `## Done\n- ${date} — ${hit} (#${pr})\n`),
  };
}

// A TODO.md item links its owning issue as `[#123](…/issues/123)`.
const issueOf = (item: string) => Number(item.match(/^\[#(\d+)\]/)?.[1]) || null;

/** Issue numbers linked by open items, so the CLI can ask GitHub which closed. */
export const linkedIssues = (todo: string): number[] =>
  openItems(todo).map(issueOf).filter((n): n is number => n !== null);

/** Items whose issue closed as completed, moved to Done: catches issues closed without a `TODO:` directive. */
export function dropClosed(todo: string, progress: string, closed: number[], date: string): { todo: string; progress: string } {
  if (!/^## Done\n/m.test(progress)) throw new Error("PROGRESS.md has no ## Done section");
  let next = { todo, progress };
  for (const item of openItems(todo)) {
    const issue = issueOf(item);
    if (issue === null || !closed.includes(issue)) continue;
    next = {
      todo: next.todo.replace(`- [ ] ${item}\n`, ""),
      progress: next.progress.replace(/^## Done\n/m, `## Done\n- ${date} — ${item} (issue closed)\n`),
    };
  }
  return next;
}

// lib/pr-directives.ts — the pure half of the PR-description directives that
// workflows act on without a model (scripts/pr-directives.ts is the CLI):
//
//   TODO: <text>   the open TODO.md item this PR finishes (unique substring)
//   DOCS: none     the documentation agent has nothing to do for this PR
//                  (matched by the workflow with a plain substring test, so
//                  write exactly that; nothing here parses it)

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

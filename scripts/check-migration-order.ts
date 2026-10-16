// scripts/check-migration-order.ts — CLI over lib/migration-order.ts.
//
//   bun scripts/check-migration-order.ts <main-ref>
//
// Fails when a migration this branch ADDS (vs its merge base with <main-ref>)
// is not newer than every migration on <main-ref>; `supabase db push` would
// refuse it on hosted. Run by ci.yml (pull requests against origin/<base>,
// pushes to main against the pre-push commit) and by land-pr.sh after it
// merges origin/main. The caller makes sure <main-ref> is present locally.
// Existing SQL files and lock entries are checked against trusted Git history,
// independently of any hashes regenerated in this branch.
import { execFileSync } from "node:child_process";
import { outOfOrder } from "@/lib/migration-order";

const main = process.argv[2];
if (!main) {
  console.error("usage: bun scripts/check-migration-order.ts <main-ref>");
  process.exit(2);
}
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
const onMain = git("ls-tree", "--name-only", main, "supabase/migrations/").filter((f) => f.endsWith(".sql"));
const added = git("diff", "--name-only", "--diff-filter=A", `${main}...HEAD`, "--", "supabase/migrations/*.sql");
const changed = git("diff", "--name-only", "--diff-filter=DMRT", `${main}...HEAD`, "--", "supabase/migrations/*.sql");
for (const file of changed) {
  console.error(`::error::${file} is immutable once committed; restore it and add a new migration instead.`);
}

// Use the shared history for existing pins: main may contain newer migrations
// that this branch has not merged yet. Ordering still uses all of current main.
const base = git("merge-base", main, "HEAD")[0];
const lockPath = "supabase/migrations.lock.json";
const trustedLock = JSON.parse(execFileSync("git", ["show", `${base}:${lockPath}`], { encoding: "utf8" })) as Record<string, string>;
const branchLock = JSON.parse(execFileSync("git", ["show", `HEAD:${lockPath}`], { encoding: "utf8" })) as Record<string, string>;
const changedPins = Object.keys(trustedLock).filter((file) => branchLock[file] !== trustedLock[file]);
for (const file of changedPins) {
  console.error(`::error::${file} has an immutable lock entry that differs from trusted history; restore the original pin.`);
}

const late = outOfOrder(onMain, added);
for (const f of late) {
  console.error(`::error::${f} sorts before the newest migration on ${main}; supabase db push will refuse it. Rename it to a later timestamp (and run bun run migrations:lock).`);
}
process.exit(late.length || changed.length || changedPins.length ? 1 : 0);

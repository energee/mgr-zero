// scripts/check-migration-order.ts — CLI over lib/migration-order.ts.
//
//   bun scripts/check-migration-order.ts <main-ref>
//
// Fails when a migration this branch ADDS (vs its merge base with <main-ref>)
// is not newer than every migration on <main-ref>; `supabase db push` would
// refuse it on hosted. Run by ci.yml (pull requests against origin/<base>,
// pushes to main against the pre-push commit) and by land-pr.sh after it
// merges origin/main. The caller makes sure <main-ref> is present locally.
// Renamed or edited migrations are out of scope here: migrations.lock.json and
// tests/migrations-applied.test.ts reject an edit to a committed migration.
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

const late = outOfOrder(onMain, added);
for (const f of late) {
  console.error(`::error::${f} sorts before the newest migration on ${main}; supabase db push will refuse it. Rename it to a later timestamp (and run bun run migrations:lock).`);
}
process.exit(late.length ? 1 : 0);

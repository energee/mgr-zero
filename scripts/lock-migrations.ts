// scripts/lock-migrations.ts — pins main's migrations and hashes branch-only work.
// Only trusted history is immutable: unmerged migrations can still be revised
// or renamed before `supabase db push` ever applies them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR = "supabase/migrations";
let lock: Record<string, string>;
try {
  const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  lock = JSON.parse(execFileSync("git", ["show", `${base}:${DIR}.lock.json`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as Record<string, string>;
} catch (error) {
  console.error(`Cannot load trusted migration history from origin/main; fetch main with its history before regenerating the lock. ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  if (!Object.hasOwn(lock, file)) {
    lock[file] = createHash("sha256").update(readFileSync(`${DIR}/${file}`)).digest("hex");
  }
}
const sorted = Object.fromEntries(Object.keys(lock).sort().map((file) => [file, lock[file]]));
writeFileSync(`${DIR}.lock.json`, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`pinned ${Object.keys(lock).length} migrations`);

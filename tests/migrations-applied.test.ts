// A migration is applied once and never read again: `supabase db push`
// (scripts/vercel-build.sh) records the version and skips the file forever
// after. Editing an applied file therefore reaches CI — which builds a database
// from scratch — and never reaches hosted. That is what produced #329 and #330.
//
// The lock pins each file's sha256; changing a file fails here, and the fix is a
// new migration, not an edit. check-migration-order.ts independently enforces
// trusted-history immutability and ordering. Adding one: `bun run migrations:lock`.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const DIR = "supabase/migrations";
const sha = (name: string) => createHash("sha256").update(readFileSync(`${DIR}/${name}`)).digest("hex");

describe("applied migrations are immutable", () => {
  const lock = JSON.parse(readFileSync(`${DIR}.lock.json`, "utf8")) as Record<string, string>;
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

  it("pins every migration file", () => {
    expect(files).toEqual(Object.keys(lock).sort());
  });

  it.each(files)("%s is unchanged since it was committed", (file) => {
    expect(sha(file)).toBe(lock[file]);
  });
});

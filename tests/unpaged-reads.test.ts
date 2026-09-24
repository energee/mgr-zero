// tests/unpaged-reads.test.ts — a ratchet on list reads that can stop at
// PostgREST's max_rows (1000) without saying so (#537, after #469/#475).
// A `.from("…").select(…)` read in lib/commands counts as bounded when it pages
// (`count: "exact"` for completeRows, or `.range(`), asks for one row
// (`.single()`/`.maybeSingle()`), caps itself (`.limit(`), or is a write
// returning what it wrote. Every other read is unpaged. The counts below are
// the reads that existed when the guard landed: a new unpaged read fails here,
// so page it through `completeRows` in lib/commands/registry.ts (or bound it);
// paging an old one fails too, until its file's count is lowered.
// Source text is the subject: the rule is about how a query is written.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BOUNDED = /\.(insert|update|upsert|delete|single|maybeSingle|limit|range)\(|count: "exact"|head: true/;

/** Each unpaged read in `src`, as the text from `.from(` to the end of its
 *  statement or the next `.from(`, whichever comes first. */
function unpagedReads(src: string): string[] {
  const starts = [...src.matchAll(/\.from\(["'`]/g)].map(match => match.index);
  return starts.flatMap((start, index) => {
    const semicolon = src.indexOf(";", start);
    const end = Math.min(semicolon < 0 ? src.length : semicolon, starts[index + 1] ?? src.length);
    const read = src.slice(start, end);
    return /\.select\(/.test(read) && !BOUNDED.test(read) ? [read] : [];
  });
}

// Unpaged reads per file when the guard landed. Only ever lower these.
const ALLOWED: Record<string, number> = {
  "catalog.ts": 7,
  "chat.ts": 2,
  "compliance.ts": 6,
  "customers.ts": 2,
  "delivery.ts": 7,
  "inventory.ts": 6,
  "orders.ts": 13,
  "packaging.ts": 9,
  "portal.ts": 9,
  "production.ts": 15,
  "purchasing.ts": 13,
  "search.ts": 4,
  "taproom.ts": 11,
  "transfers.ts": 3,
};

describe("unpagedReads", () => {
  it("flags a plain list read and passes a paged, single, limited, or write read", () => {
    expect(unpagedReads(`rows(ctx.db.from("skus").select("id").eq("brewery_id", b));`)).toHaveLength(1);
    expect(unpagedReads([
      `completeRows("Skus", start => ctx.db.from("skus").select("id", { count: "exact" }).order("id").range(start, start + PAGE_SIZE - 1));`,
      `unwrap(ctx.db.from("skus").select("id").eq("id", i.id).single());`,
      `unwrap(ctx.db.from("skus").select("id").eq("id", i.id).maybeSingle());`,
      `unwrap(ctx.db.from("orders").select("id").order("created_at").limit(20));`,
      `unwrap(ctx.db.from("skus").insert(row).select().single());`,
    ].join("\n"))).toEqual([]);
  });

  it("splits reads that share one statement", () => {
    expect(unpagedReads(`await Promise.all([unwrap(db.from("a").select("id").single()), rows(db.from("b").select("id"))]);`)).toHaveLength(1);
  });
});

describe("list reads in lib/commands page past 1000 rows", () => {
  const dir = new URL("../lib/commands/", import.meta.url);
  const files = readdirSync(dir).filter(name => name.endsWith(".ts"));

  it.each(files)("%s adds no unpaged list read", (name) => {
    const found = unpagedReads(readFileSync(new URL(name, dir), "utf8"));
    expect(found.length, `${name}: page new reads through completeRows, or lower ALLOWED["${name}"] after paging one`).toBe(ALLOWED[name] ?? 0);
  });

  it("lists only files that exist", () => {
    expect(Object.keys(ALLOWED).filter(name => !files.includes(name))).toEqual([]);
  });
});

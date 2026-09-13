// tests/command-context-provider.test.ts — a client component that runs a
// command reads actorId/breweryId from BreweryProvider (app/(app)/brewery-provider.tsx).
// The provider is mounted by the (app) and (portal) layouts only, so a page in
// any other route group must mount it itself. Without it the hooks fall back to
// { actorId: "", breweryId: "" }, which is truthy — the client still posts an
// expectedContext, and app/api/command/route.ts rejects it 400 invalid_request
// before the handler runs. Route groups do not change the URL, so moving a page
// between them is invisible in review; this test is the guard.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMMAND_CONTEXT_HOOK = /\buse(CommandAction|CommandForm|CommandContext|Brewery)\b/;
/** Route groups whose layout already mounts BreweryProvider. */
const PROVIDED = ["app/(app)/", "app/(portal)/"];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const sources = new Map([...walk("app"), ...walk("components"), ...walk("lib")].map((path) => [path, readFileSync(path, "utf8")]));

/** Modules that read the command context directly. */
const consumers = new Set([...sources].filter(([, source]) => COMMAND_CONTEXT_HOOK.test(source)).map(([path]) => path));

/** Resolve the "@/…" and relative import specifiers of one file onto real paths. */
function importsOf(path: string, source: string): string[] {
  return [...source.matchAll(/from\s+"([^"]+)"/g)].flatMap(([, specifier]) => {
    const base = specifier.startsWith("@/") ? specifier.slice(2)
      : specifier.startsWith(".") ? join(path, "..", specifier) : null;
    if (!base) return [];
    return [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")].filter((candidate) => sources.has(candidate));
  });
}

describe("command context", () => {
  it("mounts BreweryProvider for every page whose client components run commands", () => {
    const offenders = [...sources].filter(([path]) => /\/page\.tsx$/.test(path) && path.startsWith("app/"))
      .filter(([path]) => !PROVIDED.some((group) => path.startsWith(group)))
      .filter(([, source]) => !source.includes("BreweryProvider"))
      .filter(([path, source]) => importsOf(path, source).some((imported) => consumers.has(imported)))
      .map(([path]) => path);
    expect(offenders, "these pages post an empty actorId and are rejected 400").toEqual([]);
  });

  it("keeps the falsy context default that makes a missing provider fail loudly", () => {
    // If this default ever becomes a real id, the test above stops being provable.
    expect(sources.get("app/(app)/brewery-provider.tsx")).toContain('{ actorId: "", breweryId: "" }');
  });
});

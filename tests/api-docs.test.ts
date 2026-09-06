// tests/api-docs.test.ts — gates the HTTP API reference at content/docs/api:
// every registered operation is documented as available, every operation a
// screen names has a page to live on, and no page is orphaned. The tables
// themselves are generated (lib/mgr/api-operations.ts), so this covers the
// derivation and the page set rather than the prose.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_AREAS, apiOperations, areaOf, operationsInArea } from "@/lib/mgr/api-operations";
import { BACKLOG_PATH, opsEnd, opsStart, renderArea, renderBacklog } from "@/lib/mgr/api-reference";
import { API_ERRORS } from "@/lib/mgr/api-errors";
import { getCommandDefinition, listTools } from "@/lib/commands/registry";
import { fieldsOf, sampleInput } from "@/lib/mgr/api-schema";
import "@/lib/commands/all";

const root = resolve(__dirname, "..");
// The pages that explain the endpoint itself, in the order a caller meets them.
const CONCEPTS = ["overview", "authentication", "idempotency", "errors", "conventions"];
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
// One page: the rail is its headings, so it tracks the scroll — the rules as
// `##`, then `## Operations` with each area as `###` and its operations `####`.
const PAGE = () => read("content/docs/api.mdx");
const areaPage = (_slug: string) => PAGE();

describe("HTTP API reference", () => {
  it("gives every registered operation an area and marks it available", () => {
    const operations = apiOperations();
    for (const { name } of listTools()) {
      const documented = operations.find((o) => o.name === name);
      expect(documented, `${name} is not in the reference`).toBeDefined();
      expect(documented!.status, `${name} is registered, so it is available`).toBe("available");
      expect(areaOf(name), `${name} has no area rule`).toBeDefined();
    }
  });

  it("claims every operation a screen names, so none falls through the rules", () => {
    const unplaced = apiOperations().filter((o) => !areaOf(o.name));
    expect(unplaced.map((o) => o.name)).toEqual([]);
  });

  it("never presents an unbuilt operation as available", () => {
    const live = new Set(listTools().map((t) => t.name));
    for (const operation of apiOperations()) {
      expect(operation.status === "available", `${operation.name}`).toBe(live.has(operation.name));
      // A designed operation exists because a screen asked for it.
      if (operation.status === "designed") expect(operation.screens.length).toBeGreaterThan(0);
    }
  });

  it("puts the rules first, then every area under Operations, Today leading", () => {
    const page = PAGE();
    const h2 = [...page.matchAll(/^## .+ \[#([a-z-]+)\]$/gm)].map((m) => m[1]);
    // The cross-cutting rules come before the operation list: a caller who
    // reads the operations first still has to come back for auth and retries.
    expect(h2).toEqual([...CONCEPTS, "operations"]);
    const h3 = [...page.matchAll(/^### .+ \[#([a-z-]+)\]$/gm)].map((m) => m[1]).filter((s) => API_AREAS.some((a) => a.slug === s));
    expect(h3[0], "Today leads the operations").toBe("today");
    expect(h3.sort()).toEqual(API_AREAS.map((a) => a.slug).sort());
    for (const area of API_AREAS) {
      const page = areaPage(area.slug);
      // Fumadocs builds "On this page" from MDX headings at compile time, so
      // every operation is a real heading in the file rather than a
      // component's table row. `bun run docs:api` writes the block between
      // each area's markers; this proves the committed page still matches the
      // registry and the screens.
      const block = page.slice(page.indexOf(opsStart(area.slug)), page.indexOf(opsEnd(area.slug)) + opsEnd(area.slug).length);
      expect(block, `${area.slug} is stale — run \`bun run docs:api\``).toBe(renderArea(area.slug).trimEnd());
      // An available operation is documented in full; a designed one is a row
      // in the closing list, because there is no schema to document yet.
      for (const operation of operationsInArea(area.slug)) {
        const entry = operation.status === "available"
          ? `#### ${operation.name} [#${operation.name}]`
          : `| \`${operation.name}\` |`;
        expect(page, `${area.slug} is missing ${operation.name}`).toContain(entry);
      }
      // Designed operations sit at the bottom, after everything callable.
      const planned = operationsInArea(area.slug).filter((o) => o.status === "designed");
      const live = operationsInArea(area.slug).filter((o) => o.status === "available");
      if (planned.length > 0 && live.length > 0) {
        expect(page.indexOf(`{/* ${area.slug}-designed */}`), `${area.slug} lists designed operations before available ones`)
          .toBeGreaterThan(page.lastIndexOf(`#### ${live[live.length - 1].name} `));
      }
      // A caller should never have to guess the request: an available
      // operation carries a runnable example naming itself.
      for (const operation of operationsInArea(area.slug).filter((o) => o.status === "available")) {
        expect(page, `${operation.name} has no example request`).toContain(`"name": "${operation.name}"`);
      }
      expect(operationsInArea(area.slug).length, `${area.slug} has no operations`).toBeGreaterThan(0);
    }
  });

  // One copy only: README carried a duplicate of this reference once before.
  it("keeps the reference out of README, which links to it instead", () => {
    const readme = read("README.md");
    expect(readme).not.toMatch(/^## HTTP API$/m);
    expect(readme).toContain("/docs/api");
    for (const { name } of listTools()) {
      expect(readme, `${name} is duplicated in README.md`).not.toContain(`\`${name}\``);
    }
  });

  // The sync agent must patch the pages it is pointed at.
  it("points the http-api agent at the canonical pages", () => {
    for (const path of [".agents/agents/http-api.md", ".pi/prompts/http-api.md", "AGENTS.md"]) {
      expect(read(path), `${path} still owns the README section`).toContain("content/docs/api");
    }
  });

  // The example bodies are generated from each operation's Zod schema, so a
  // field the handler requires cannot go undocumented.
  it("builds every example from the schema the handler parses", () => {
    for (const { name } of listTools()) {
      const schema = getCommandDefinition(name)?.input;
      if (!schema) continue;
      const page = areaPage(areaOf(name)!);
      for (const field of fieldsOf(schema)) {
        expect(page, `${name} does not document ${field.name}`).toContain(`| \`${field.name}\` |`);
      }
      for (const required of Object.keys(sampleInput(schema))) {
        expect(page, `${name}'s example omits required ${required}`).toContain(`"${required}"`);
      }
    }
  });

  // Every area lives on one page, so a repeated anchor is both a duplicate DOM
  // id (links land on the wrong section) and a duplicate React key, which stops
  // the table of contents rendering and tracking. This caught `#available` and
  // `#designed` repeating 13 times each.
  it("gives every heading on the page a unique anchor", () => {
    const anchors = [...PAGE().matchAll(/\[#([a-z0-9_-]+)\]/g)].map((m) => m[1]);
    const repeated = [...new Set(anchors.filter((a, i) => anchors.indexOf(a) !== i))];
    expect(repeated).toEqual([]);
  });

  // The designed operations are the backend push. The reference publishes them
  // per area; this file is the same list as one plan, so planning and the
  // published roadmap cannot disagree.
  it("writes the designed operations out as the backend backlog", () => {
    expect(read(BACKLOG_PATH), "backlog is stale — run `bun run docs:api`").toBe(renderBacklog());
    const backlog = read(BACKLOG_PATH);
    for (const operation of apiOperations().filter((o) => o.status === "designed")) {
      expect(backlog, `${operation.name} is not in the backlog`).toContain(`\`${operation.name}\``);
    }
    for (const operation of apiOperations().filter((o) => o.status === "available")) {
      expect(backlog, `${operation.name} is built but still in the backlog`).not.toContain(`\`${operation.name}\``);
    }
  });

  // The errors page is the caller's whole failure contract, so a code raised in
  // the endpoint that it does not explain is a hole a developer falls into.
  it("explains every error code the endpoint can raise", () => {
    const sources = ["app/api/command/route.ts", "lib/commands/registry.ts", ...readdirSync(resolve(root, "lib/commands")).map((f) => `lib/commands/${f}`)]
      .filter((f) => f.endsWith(".ts"))
      .map(read).join("\n");
    const raised = new Set([...sources.matchAll(/CommandError\([^;]*?,\s*\d{3},\s*"([a-z_]+)"/g)].map((m) => m[1]));
    raised.add("bad_request"); // CommandError's default code, used without naming it.
    const documented = new Set(API_ERRORS.map((e) => e.code));
    expect([...raised].filter((c) => !documented.has(c)), "raised but undocumented").toEqual([]);
    expect([...documented].filter((c) => !raised.has(c)), "documented but never raised").toEqual([]);
    const page = PAGE();
    for (const error of API_ERRORS) expect(page, `${error.code} missing`).toContain(`\`${error.code}\``);
  });

  // The matrix is what a developer building for one role reads instead of
  // checking 55 operations by hand.
  it("puts every available operation in the role matrix", () => {
    const page = PAGE();
    for (const operation of apiOperations().filter((o) => o.status === "available")) {
      expect(page, `${operation.name} is not in the role matrix`).toContain(`| \`${operation.name}\` |`);
    }
  });

  it("states the envelope once, in the overview, and the codes under errors", () => {
    const page = PAGE();
    const overview = page.slice(page.indexOf("## Overview"), page.indexOf("## Authentication"));
    expect(overview).toContain("POST /api/command");
    expect(overview).toContain("correlationId");
    const errors = page.slice(page.indexOf("## Errors"), page.indexOf("## Conventions"));
    for (const code of ["400", "401", "403", "404", "409", "500"]) expect(errors).toContain(code);
    expect(page.slice(page.indexOf("## Operations"))).not.toContain("POST /api/command");
  });
  // A screen must not invent a second name for an operation the registry
  // already answers: the reference would then list the same capability twice,
  // once available and once designed. Each retired alias below was a screen
  // spelling of the registered name beside it (YAGNI pass, 2026-09-06).
  it("never designs an alias of an operation the registry already answers", () => {
    const retired: Record<string, string> = {
      create_customer: "upsert_customer",
      update_customer: "upsert_customer",
      create_ship_to: "upsert_ship_to",
      update_ship_to: "upsert_ship_to",
      create_price_list: "upsert_price_list",
      update_price_list: "upsert_price_list",
      adjust_order_line: "adjust_order_lines",
      get_daily_pick_sheet: "daily_pick_sheet",
      get_portal_catalog: "portal_catalog",
      list_portal_orders: "portal_orders",
      list_portal_invoices: "portal_invoices",
      get_standing_allocations: "list_standing_allocations",
      list_sales_channels: "list_sale_channels",
    };
    const named = new Set(apiOperations().map((o) => o.name));
    for (const [alias, use] of Object.entries(retired)) {
      expect(named.has(alias), `${alias} duplicates ${use}`).toBe(false);
    }
  });
});

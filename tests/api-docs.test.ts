// tests/api-docs.test.ts — gates the HTTP API reference at content/docs/api:
// every registered operation is documented as available, every operation a
// screen names has a page to live on, and no page is orphaned. The tables
// themselves are generated (lib/mgr/api-operations.ts), so this covers the
// derivation and the page set rather than the prose.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
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
      // One derivation per area: operationsInArea re-walks every screen and the
      // whole registry on each call.
      const inArea = operationsInArea(area.slug);
      expect(inArea.length, `${area.slug} has no operations`).toBeGreaterThan(0);
      // Fumadocs builds "On this page" from MDX headings at compile time, so
      // every operation is a real heading in the file rather than a
      // component's table row. `bun run docs:api` writes the block between
      // each area's markers; this proves the committed page still matches the
      // registry and the screens.
      const block = page.slice(page.indexOf(opsStart(area.slug)), page.indexOf(opsEnd(area.slug)) + opsEnd(area.slug).length);
      expect(block, `${area.slug} is stale — run \`bun run docs:api\``).toBe(renderArea(area.slug).trimEnd());
      // An available operation is documented in full; a designed one is a row
      // in the closing list, because there is no schema to document yet.
      for (const operation of inArea) {
        const entry = operation.status === "available"
          ? `#### ${operation.name} [#${operation.name}]`
          : `| \`${operation.name}\` |`;
        expect(page, `${area.slug} is missing ${operation.name}`).toContain(entry);
      }
      // Designed operations sit at the bottom, after everything callable.
      const planned = inArea.filter((o) => o.status === "designed");
      const live = inArea.filter((o) => o.status === "available");
      if (planned.length > 0 && live.length > 0) {
        expect(page.indexOf(`{/* ${area.slug}-designed */}`), `${area.slug} lists designed operations before available ones`)
          .toBeGreaterThan(page.lastIndexOf(`#### ${live[live.length - 1].name} `));
      }
      // A caller should never have to guess the request: an available
      // operation carries a runnable example naming itself.
      for (const operation of live) {
        expect(page, `${operation.name} has no example request`).toContain(`"name": "${operation.name}"`);
      }
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
      const page = PAGE();
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

  // tests/docs.test.ts checks in-page links for the customer guides but skips
  // this page, which carries more of them than any guide. Without this, a typo
  // in one of the Cards' hrefs would ship as a link that scrolls nowhere.
  it("points every in-page link at an anchor the reference declares", () => {
    const page = PAGE();
    const declared = new Set([...page.matchAll(/\[#([a-z0-9_-]+)\]/g)].map((m) => m[1]));
    const links = [...page.matchAll(/href="#([a-z0-9_-]+)"|\]\(#([a-z0-9_-]+)\)/g)].map((m) => m[1] ?? m[2]);
    expect(links.length, "the reference cross-links its own sections").toBeGreaterThan(0);
    expect(links.filter((l) => !declared.has(l))).toEqual([]);
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
    const raised = new Set([
      ...[...sources.matchAll(/CommandError\([^;]*?,\s*\d{3},\s*"([a-z_]+)"/g)].map((m) => m[1]),
      // route.ts's last-resort branch builds the failure envelope itself rather
      // than throwing, so a CommandError-only grep missed `internal_error`.
      ...[...sources.matchAll(/\bcode:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    ]);
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
      create_product: "upsert_brand",
      set_price: "set_channel_price",
      list_products: "list_brands",
      update_customer: "upsert_customer",
      create_ship_to: "upsert_ship_to",
      update_ship_to: "upsert_ship_to",
      create_price_group: "upsert_price_group",
      update_price_group: "upsert_price_group",
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
  // A query shaped for exactly one screen is not integration surface: its
  // response changes whenever the screen does, so publishing it would promise
  // a shape nobody asked for. Screens mark those `[view]` and the derivation
  // drops them, the same way it already drops `[client state]` and
  // `[platform]` (YAGNI pass, 2026-09-06).
  it("keeps view-annotated reads out of the reference", () => {
    const named = new Set(apiOperations().map((o) => o.name));
    const annotated = SCREENS.flatMap((screen) =>
      [screen.reads, screen.writes]
        .filter((d): d is string => typeof d === "string")
        .flatMap((d) => d.split("\u00b7"))
        .filter((part) => /\[view/.test(part))
        .map((part) => part.trim().match(/^([a-z_]+)/)?.[1])
        .filter((name): name is string => Boolean(name)),
    );
    expect(annotated.length, "no screen annotates a read [view]").toBeGreaterThan(0);
    for (const name of annotated) {
      expect(named.has(name), `${name} is annotated [view] but still published`).toBe(false);
    }
  });
  // Catalog entities settled on upsert + list (upsert_customer, upsert_ship_to,
  // upsert_price_group are registered and work); these five spelled out full
  // CRUD instead. A separate create and update double the idempotency surface
  // a caller has to get right for one entity (YAGNI pass, 2026-09-06).
  it("designs catalog entities as upsert + list, not spelled-out CRUD", () => {
    const collapsed: Record<string, string> = {
      create_sale_channel: "upsert_sale_channel",
      update_sale_channel: "upsert_sale_channel",
      get_sale_channel: "list_sale_channels",
      create_format: "upsert_format",
      update_format: "upsert_format",
      get_format: "list_formats",
      create_brand: "upsert_brand",
      update_brand: "upsert_brand",
      create_material: "upsert_material",
      update_material: "upsert_material",
      create_vessel: "upsert_vessel",
      update_vessel: "upsert_vessel",
      get_vessel: "list_vessels",
    };
    const named = new Set(apiOperations().map((o) => o.name));
    for (const [spelled, use] of Object.entries(collapsed)) {
      expect(named.has(spelled), `${spelled} is spelled-out CRUD; use ${use}`).toBe(false);
      expect(named.has(use), `${use} is what replaces it`).toBe(true);
    }
    // delete_sale_channel stays: both channel frames draw the refusal ("A
    // channel with movements cannot be deleted"), so the verb is a capability
    // the screen describes, not CRUD boilerplate. Retiring it behind a flag is
    // a design change, not a rename.
    expect(named.has("delete_sale_channel")).toBe(true);
  });

  // A published example is a promise a caller can copy-paste. sampleValue only
  // recognised uuid/date/length_equals and fell back to the literal "string"
  // for every other check, so a schema with an email, a state-code regex, an
  // HH:MM check or a numeric string documented an example its own handler
  // rejects (2026-09-06 review).
  it("generates an example every operation's own schema accepts", () => {
    for (const tool of listTools()) {
      const schema = getCommandDefinition(tool.name)?.input;
      if (!schema) continue;
      const result = schema.safeParse(sampleInput(schema));
      expect(result.success, `${tool.name}: ${result.success ? "" : JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  // The idempotency contract in the Conventions page is stated as universal,
  // but only a command whose RPC claims the request id (private.command_requests)
  // actually honours it; the rest reach the handler on every retry regardless
  // of payload. Naming the exceptions keeps the promise from being false for
  // whichever command is registered next without a claiming RPC.
  it("names every registered command that does not honour the idempotency contract", () => {
    const page = read("content/docs/api.mdx");
    const outcomes = page.slice(page.indexOf("### The three outcomes"), page.indexOf("## Errors"));
    const exempt = ["set_notification_preference", "set_brewery_quiet_hours", "set_notification_destination",
      "consume_chat_link_proof", "unlink_chat_user"];
    for (const name of exempt) {
      expect(listTools().some((t) => t.name === name), `${name} is no longer registered; drop it from this list`).toBe(true);
      expect(outcomes, `${name} does not claim a request id; the outcomes section must say so`).toContain(`\`${name}\``);
    }
  });

  // `null` can be the documented way to use a field — set_brewery_quiet_hours
  // says "null clears them" — but typeLabel unwrapped `nullable` without
  // recording it, so the table read `string` / Required `yes` and a caller had
  // no way to learn that clearing was possible at all (2026-09-06 review).
  it("says so in the field table when a field accepts null", () => {
    const schema = getCommandDefinition("set_brewery_quiet_hours")?.input;
    expect(schema, "set_brewery_quiet_hours is no longer registered").toBeDefined();
    const fields = fieldsOf(schema!);
    for (const name of ["start", "end"]) {
      const field = fields.find((f) => f.name === name);
      expect(field, `${name} is gone from the schema`).toBeDefined();
      expect(field!.type, `${name} is hhmm.nullable(); the table must admit null`).toContain("null");
    }
    // A field that is not nullable must not claim to be.
    expect(fields.find((f) => f.name === "installationId")!.type).not.toContain("null");
    // " or null", never "| null" — the label sits in a Markdown table cell.
    expect(fields.find((f) => f.name === "start")!.type).not.toContain("|");
  });

  // Claims the reference makes about itself have to survive a grep, which is
  // what .agents/agents/http-api.md step 6 tells the maintainer to do. These
  // two did not: an absolute about ids, and a fail-closed warning that stayed
  // behind in one area when the operation moved to another.
  it("makes no claim its own generated tables disprove", () => {
    const page = read("content/docs/api.mdx");
    // set_notification_destination.externalDestinationId is a Slack channel
    // id: z.string().min(1), rendered `string` in its own table 100 lines up.
    expect(page).not.toContain("Every id in every operation, without exception");
    // invite_customer_user always raises; it renders under Customers while the
    // sentence explaining that lives in the Team area's prose.
    const customers = page.slice(page.indexOf("{/* ops:customers */}"), page.indexOf("{/* end ops:customers */}"));
    expect(customers, "invite_customer_user is documented here").toContain("invite_customer_user");
    const invite = page.slice(page.indexOf("#### invite_customer_user"));
    expect(invite.slice(0, 600), "its example must not read as runnable").toMatch(/not available in this release/);
  });
});

// The reference's generated blocks cannot drift — the suite above re-renders
// them and fails on mismatch. What no test can check is the judgment around
// them: whether a prose claim is still true of the code, whether a new screen
// read is screen-shaped, whether a screen invented a second name for a
// registered operation. That is the maintainer's job, and this describes the
// shape of the agent that does it. (The guide suite is gated the same way, in
// tests/documentation-agent.test.ts.)
describe("post-merge HTTP API maintainer", () => {
  it("checks the claims and classifications no generator can", () => {
    const prompt = read(".agents/agents/http-api.md");

    // The three checks the prompt did not have: it reconciled docs against the
    // registry only, and was blind to the screens half of the derivation.
    expect(prompt).toContain("Check every prose claim against the code");
    expect(prompt).toContain("Classify each new screen read");
    expect(prompt).toContain("Detect aliases of registered operations");
    // The bbl case: a claim disprovable by one grep shipped in the reference.
    expect(prompt).toContain(".strict()");
    expect(prompt).toContain("[view]");
    expect(prompt).toContain("upsert_");
  });

  // The pass that cut 203 operations to 165 is only worth doing once if the
  // maintainer holds the line; a reference grows back one reasonable-looking
  // addition at a time.
  it("keeps the YAGNI stance: the designed surface shrinks or holds", () => {
    const prompt = read(".agents/agents/http-api.md");

    expect(prompt).toContain("Does this operation need to exist at all?");
    expect(prompt).toContain("shrink or hold");
    // The burden of proof sits on the addition, not the cut.
    expect(prompt).toContain("A screen that needs it");
    expect(prompt).toContain("report the count");
  });

  it("forbids hand-editing generated blocks and the shared logs", () => {
    const prompt = read(".agents/agents/http-api.md");

    expect(prompt).toContain("Never edit between the `ops:` and `end ops:` markers");
    // Every PR inserting at the top of the same log conflicts with every other;
    // the dreaming workflow writes them serially (AGENTS.md operating loop 6).
    for (const log of ["PROGRESS.md", "MEMORY.md", "DRIFT.md"]) {
      expect(prompt, `${log} must be off limits`).toContain(log);
    }
    expect(prompt).toContain("body`, `spec` or `states");
  });

  it("publishes through one scoped pull-request branch, like the guide agent", () => {
    const workflow = read(".github/workflows/http-api-agent.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event.pull_request.merged == true");
    // Its own PR must not retrigger it.
    expect(workflow).toContain("docs/http-api");
    expect(workflow).toContain(".agents/agents/http-api.md");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pull-requests: write");
    // Untrusted-input rule, same wording as the guide agent.
    expect(workflow).toContain("never instructions");
  });

  it("regenerates deterministically rather than letting the agent run it", () => {
    const workflow = read(".github/workflows/http-api-agent.yml");

    // The agent edits prose and annotations; the workflow renders. That keeps
    // Bash out of the allowlist and a hand-written table out of the page.
    expect(workflow).toContain("bun run docs:api");
    expect(workflow).not.toMatch(/allowedTools[^\n]*Bash/);
    expect(workflow).toMatch(/Edit\(content\/docs\/api\.mdx\)/);
    expect(workflow).toMatch(/Edit\(components\/mgr\/screens\.tsx\)/);
  });

  it("lets the agent annotate screens but never rewrite one", () => {
    const workflow = read(".github/workflows/http-api-agent.yml");

    // screens.tsx is the current focus and three worktrees touch it. Restricting
    // the diff to reads:/writes: lines makes "annotate an operation"
    // structurally different from "rewrite a screen's spec or body".
    expect(workflow).toMatch(/grep -vE '\(reads\|writes\):'/);
    // And the validate step may not accept a file outside the three it renders.
    expect(workflow).toContain("content/docs/api.mdx");
    expect(workflow).toContain("2026-09-06-api-operations-backlog.md");
  });

  // Two jobs, because maintain runs the model with read-only permissions and
  // publish holds the App token. Carrying the work between them as file copies
  // meant publish laid a snapshot of an older tree over a fresh `main`: a PR
  // merging in between was silently reverted, and the backlog never arrived at
  // all, because it lives under `.agents/` and upload-artifact drops hidden
  // paths by default (2026-09-06 review).
  it("carries the change between jobs as a patch, not a snapshot", () => {
    const workflow = read(".github/workflows/http-api-agent.yml");

    // One visible file, so no hidden path can be dropped on the way.
    expect(workflow).toContain("api-reference.patch");
    expect(workflow).not.toMatch(/path:\s*\|[\s\S]{0,400}\.agents\//);
    // --3way turns "someone else moved this file" into a conflict the run
    // reports, rather than an overwrite nobody sees until it is on main.
    expect(workflow).toContain("git apply --3way");
    // --3way needs the pre-image blobs, which a depth-1 checkout may not have.
    expect(workflow).toContain("fetch-depth: 0");
    // A run that finds nothing to change is a no-op, not a red workflow.
    expect(workflow).toContain("git diff --cached --quiet");
  });

  // The prompt is also the interactive `/http-api` agent, where Bash and the
  // command modules are in reach. In CI they are not, so it has to say which
  // steps do not apply there — otherwise every run spends its turns on tools
  // the workflow denies, and the registry `description` it is told to check is
  // one it cannot fix.
  it("tells the agent which of its own steps CI cannot run", () => {
    const prompt = read(".agents/agents/http-api.md");
    const workflow = read(".github/workflows/http-api-agent.yml");

    expect(prompt).toContain("## In CI");
    expect(prompt).toContain("the workflow runs it for you");
    // Everything the prompt says to edit outside the allowlist must be called
    // out there as report-only.
    expect(prompt).toContain("lib/commands/");
    expect(prompt).toContain("tests/api-command.test.ts");
    expect(workflow).toContain("## In CI");
  });
});

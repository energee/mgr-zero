// tests/docs.test.ts — the customer guides are Fumadocs MDX pages in
// content/docs (lib/source.ts, app/(docs)/docs). Guards the shape the
// documentation maintainer must keep, and the legacy URL redirects.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
// content/docs/meta.json is the one list of guides: it orders the sidebar, so
// a guide missing from it is invisible. Everything else here derives from it.
const GUIDES: string[] = JSON.parse(read("content/docs/meta.json")).pages;
// The API reference is integrator documentation: same site and sidebar, but it
// carries code blocks and words like "schema" that the customer guides forbid.
// tests/api-docs.test.ts owns it; everything here is about the guides.
const CUSTOMER_GUIDES = GUIDES.filter((g) => g !== "api");

describe("customer guides (MDX)", () => {
  it("has exactly the pages meta.json lists, each with frontmatter and no code", () => {
    const files = readdirSync(resolve(root, "content/docs")).filter((f) => f.endsWith(".mdx")).sort();
    // The API reference is a folder of pages (content/docs/api/), not one file.
    expect(files).toEqual(CUSTOMER_GUIDES.map((g) => `${g}.mdx`).sort());
    for (const guide of CUSTOMER_GUIDES) {
      const mdx = read(`content/docs/${guide}.mdx`);
      expect(mdx).toMatch(/^---\n(?:\w+: .+\n)*title: .+\ndescription: .+\n(?:\w+: .+\n)*---\n/);
      // Prose only: no imports/exports, scripts, raw HTML or styling hooks.
      expect(mdx).not.toMatch(/^(import|export)\s/m);
      expect(mdx).not.toMatch(/<(?:script|style|link|iframe|img|div|span|p|a)\b/i);
      expect(mdx).not.toMatch(/\b(?:RLS|schema|command ID|slice \d|implementation gate)\b/i);
    }
  });

  it("gives the API reference a place in the sidebar and on the chooser", () => {
    expect(GUIDES).toContain("api");
    expect(read("content/docs/api/index.mdx")).toMatch(/^---\n/);
    expect(read("content/docs/index.mdx")).toContain('href="/docs/api"');
  });

  it("keeps the master chooser linked to both audiences and the audiences apart", () => {
    const master = read("content/docs/index.mdx");
    const staff = read("content/docs/staff-guide.mdx");
    const portal = read("content/docs/portal-guide.mdx");
    expect(master).toContain('href="/docs/staff-guide"');
    expect(master).toContain('href="/docs/portal-guide"');
    expect(staff).not.toContain("[#customer-portal]");
    expect(portal).not.toContain("Record Movement");
    for (const section of ["sign-in", "roles", "navigation", "catalog", "inventory", "customers", "pricing", "orders", "pick-sheet", "invoices", "locations", "transfers", "replenishment", "team", "slack", "errors-corrections", "unavailable"]) {
      expect(staff).toContain(`[#${section}]`);
    }
    for (const section of ["access", "shop", "statuses", "orders", "invoices", "account", "help"]) {
      expect(portal).toContain(`[#${section}]`);
    }
  });

  it("points every in-page link at an anchor the guide actually declares", () => {
    const broken = CUSTOMER_GUIDES.flatMap((guide) => {
      const mdx = read(`content/docs/${guide}.mdx`);
      // Headings declare their anchor inline as `## Title [#slug]`.
      const declared = new Set([...mdx.matchAll(/\[#([a-z0-9-]+)\]/g)].map((m) => m[1]));
      return [...mdx.matchAll(/\]\(#([a-z0-9-]+)\)/g)]
        .filter((m) => !declared.has(m[1]))
        .map((m) => `${guide}.mdx -> #${m[1]}`);
    });
    expect(broken).toEqual([]);
  });
});

// A guide section that describes a screen embeds it: <Screen name="…" /> draws
// the inventory frame (components/mgr/screen-embed.tsx) under the prose.
describe("guide screen embeds", () => {
  it("names only screens the inventory has, and covers the main sections", () => {
    const names = new Set(SCREENS.filter((s) => !s.venue).map((s) => s.name));
    const embeds = (guide: string) => [...read(`content/docs/${guide}.mdx`).matchAll(/<Screen name="([^"]+)" \/>/g)].map((m) => m[1]);
    for (const guide of ["staff-guide", "portal-guide"]) {
      const found = embeds(guide);
      expect(found.length, `${guide} has no embeds`).toBeGreaterThan(0);
      expect(found.filter((n) => !names.has(n)), `${guide} names unknown screens`).toEqual([]);
    }
    expect(embeds("staff-guide")).toEqual(expect.arrayContaining(["Sign in", "Today", "Orders", "Pick sheet", "Invoices", "Team"]));
    expect(embeds("portal-guide")).toEqual(expect.arrayContaining(["Portal sign in", "Shop", "Order history", "Account"]));
    // The maintainer must know the component exists, or it will strip them.
    expect(read(".agents/agents/documentation-maintainer.md")).toContain("<Screen name=");
  });
});

describe("guide URLs", () => {
  it("redirects the pre-Fumadocs paths to the docs routes", async () => {
    const config = (await import("@/next.config")).default;
    const redirects = await config.redirects!();
    expect(redirects).toContainEqual({ source: "/docs/user-guide{.html}?", destination: "/docs", permanent: true });
    expect(redirects).toContainEqual({
      source: "/docs/:guide(staff-guide|portal-guide).html",
      destination: "/docs/:guide",
      permanent: true,
    });
  });
});

// #719: New Order's SKU field is OrderSkuPicker, which filters the supplied
// options locally; it keeps no recent choices and no search cache. The guide
// must not promise the header Search's recents for it.
describe("New Order SKU picker guide", () => {
  it("describes local filtering, not recent choices or cached searches", () => {
    const view = read("components/mgr/views/new-order.tsx");
    expect(view).not.toContain("SearchPalette");
    const para = read("content/docs/staff-guide.mdx").split("\n").find((line) => line.startsWith("SKU fields in **New Order**"));
    expect(para).toBeDefined();
    expect(para).not.toMatch(/recent|cached/i);
  });
});

// Process guards from the 2026-10-10 docs reconciliation. Each one catches a
// class of drift that had piled up unnoticed: dead paths in the agent entry
// docs, specs still saying to edit the baseline migration, and env names the
// code reads that .env.example never lists.
// GIT_* is stripped: the pre-push hook exports GIT_DIR, which would point git
// at the wrong repository.
const gitEnv = { ...process.env };
for (const key of Object.keys(gitEnv)) if (key.startsWith("GIT_")) delete gitEnv[key];
const gitFiles = (pattern: string) =>
  execFileSync("git", ["ls-files", pattern], { cwd: root, encoding: "utf8", env: gitEnv })
    .split("\n")
    .filter(Boolean);

describe("agent entry docs", () => {
  // Backticked text that is not a file path, or a path another lane must fix.
  const IGNORE = new Set([
    "docs/http-api", // a branch name in ARCHITECTURE.md, not a path
    "docs/audits/2026-09-05/security.md", // dead citation in ARCHITECTURE.md; fixed by the docs-reconcile logs lane
  ]);

  it("names only repo paths that exist", () => {
    const tops = new Set(readdirSync(root));
    const docs = ["AGENTS.md", ".agents/ARCHITECTURE.md", "README.md", ...gitFiles(".agents/skills/*/SKILL.md")];
    const missing = docs
      // The hugeicons skill is vendored and names paths in its own repo.
      .filter((doc) => !doc.includes("/hugeicons/"))
      .flatMap((doc) =>
        [...read(doc).matchAll(/`([^`\s]+)`/g)]
          .map((m) => m[1].replace(/[/.,:;]+$/, "").split(/[:#]/)[0])
          .filter((p) => p.includes("/") && !/[<>*{}$()=|]/.test(p) && tops.has(p.split("/")[0]) && !IGNORE.has(p))
          .filter((p) => !existsSync(resolve(root, p)))
          .map((p) => `${doc} -> ${p}`),
      );
    expect(missing).toEqual([]);
  });
});

describe("baseline migration rule", () => {
  // Before #285 the baseline migration was edited in place; AGENTS.md now
  // forbids editing any committed migration. Docs from that window must say so.
  it("marks every doc that edits 00001_baseline.sql in place as pre-#285 or historical", () => {
    const stale = gitFiles("*.md").filter((path) => {
      const text = read(path);
      return text.includes("00001_baseline.sql") && text.includes("in place") && !/pre-#285|Historical/.test(text);
    });
    expect(stale).toEqual([]);
  });
});

describe(".env.example", () => {
  it("names every environment variable the app and shell scripts read", () => {
    const sources = [...gitFiles("lib/**"), ...gitFiles("app/**"), ...gitFiles("scripts/*.sh")];
    const names = sources.flatMap((path) =>
      // process.env.X, lib/env's required(env, "X"), and shell ${X:?} / ${X:-}.
      [...read(path).matchAll(/process\.env\.([A-Z][A-Z0-9_]*[A-Z0-9])\b|\(env, "([A-Z][A-Z0-9_]*)"\)|\$\{([A-Z][A-Z0-9_]*):[?-]/g)].map(
        (m) => m[1] ?? m[2] ?? m[3],
      ),
    );
    // Set by the runtime or by the test harness, not by an operator.
    const RUNTIME = new Set(["NODE_ENV", "TEST_DATABASE_URL", "DATABASE_URL", "MGR_TEST_DB_RESET", "CLAUDE_SESSION_URL"]);
    const example = read(".env.example");
    const missing = [...new Set(names)].filter((name) => !RUNTIME.has(name) && !new RegExp(`^#? ?${name}=`, "m").test(example));
    expect(missing).toEqual([]);
  });
});

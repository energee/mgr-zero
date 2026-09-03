// tests/docs.test.ts — the customer guides are Fumadocs MDX pages in
// content/docs (lib/source.ts, app/(docs)/docs). Guards the shape the
// documentation maintainer must keep, and the legacy URL redirects.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
// content/docs/meta.json is the one list of guides: it orders the sidebar, so
// a guide missing from it is invisible. Everything else here derives from it.
const GUIDES: string[] = JSON.parse(read("content/docs/meta.json")).pages;

describe("customer guides (MDX)", () => {
  it("has exactly the three guides, each with frontmatter and no code", () => {
    const files = readdirSync(resolve(root, "content/docs")).filter((f) => f.endsWith(".mdx")).sort();
    expect(files).toEqual(GUIDES.map((g) => `${g}.mdx`).sort());
    for (const guide of GUIDES) {
      const mdx = read(`content/docs/${guide}.mdx`);
      expect(mdx).toMatch(/^---\n(?:\w+: .+\n)*title: .+\ndescription: .+\n(?:\w+: .+\n)*---\n/);
      // Prose only: no imports/exports, scripts, raw HTML or styling hooks.
      expect(mdx).not.toMatch(/^(import|export)\s/m);
      expect(mdx).not.toMatch(/<(?:script|style|link|iframe|img|div|span|p|a)\b/i);
      expect(mdx).not.toMatch(/\b(?:RLS|schema|command ID|slice \d|implementation gate)\b/i);
    }
  });

  it("keeps the master chooser linked to both audiences and the audiences apart", () => {
    const master = read("content/docs/index.mdx");
    const staff = read("content/docs/staff-guide.mdx");
    const portal = read("content/docs/portal-guide.mdx");
    expect(master).toContain('href="/docs/staff-guide"');
    expect(master).toContain('href="/docs/portal-guide"');
    expect(staff).not.toContain("[#customer-portal]");
    expect(portal).not.toContain("Record Movement");
    for (const section of ["sign-in", "roles", "navigation", "catalog", "inventory", "customers", "pricing", "orders", "pick-sheet", "invoices", "replenishment", "team", "slack", "errors-corrections", "unavailable"]) {
      expect(staff).toContain(`[#${section}]`);
    }
    for (const section of ["access", "shop", "statuses", "orders", "invoices", "help"]) {
      expect(portal).toContain(`[#${section}]`);
    }
  });

  it("points every in-page link at an anchor the guide actually declares", () => {
    const broken = GUIDES.flatMap((guide) => {
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

// tests/documentation-agent.test.ts — keeps the guide suite and its post-merge maintainer comprehensive, scoped, and reviewable.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("customer documentation", () => {
  it("separates staff and portal documentation behind one master guide", () => {
    const master = read("public/docs/user-guide.html");
    const staff = read("public/docs/staff-guide.html");
    const portal = read("public/docs/portal-guide.html");

    for (const guide of [master, staff, portal]) {
      expect(guide).toMatch(/^<!doctype html>/i);
      expect(guide).toContain("<main");
      expect(guide).toContain("<nav");
      expect(guide).not.toMatch(/<(?:script|link)\b/i);
      const ids = new Set([...guide.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
      for (const match of guide.matchAll(/href="#([^"]+)"/g)) {
        expect(ids.has(match[1]), `missing anchor target #${match[1]}`).toBe(true);
      }
      expect(guide).not.toMatch(/\b(?:RLS|schema|command ID|slice \d|implementation gate)\b/i);
    }

    expect(master).toContain("staff-guide.html");
    expect(master).toContain("portal-guide.html");
    expect(staff).toContain("@media print");
    expect(portal).toContain("@media print");
    expect(staff).not.toContain('id="customer-portal"');
    expect(portal).not.toContain("Record Movement");

    for (const section of [
      "sign-in",
      "roles",
      "navigation",
      "catalog",
      "inventory",
      "customers",
      "pricing",
      "orders",
      "pick-sheet",
      "invoices",
      "replenishment",
      "team",
      "slack",
      "errors-corrections",
      "unavailable",
    ]) {
      expect(staff).toContain(`id="${section}"`);
    }
    for (const section of ["access", "shop", "statuses", "orders", "invoices", "help"]) {
      expect(portal).toContain(`id="${section}"`);
    }
  });
});

describe("HTTP API documentation", () => {
  it("has one catalog containing every registered operation", () => {
    const readme = read("README.md");
    expect(readme.match(/^## HTTP API$/gm)).toHaveLength(1);

    for (const file of readdirSync(resolve(root, "lib/commands")).filter((name) => name.endsWith(".ts"))) {
      for (const [, name] of read(`lib/commands/${file}`).matchAll(/define(?:Command|Query)\(\{\s*name:\s*"([^"]+)"/g)) {
        expect(readme, `${name} is missing from README.md`).toContain(`\`${name}\``);
      }
    }
  });
});

describe("post-merge documentation maintainer", () => {
  it("audits the complete live UI and may edit only the HTML guide suite", () => {
    const prompt = read(".agents/agents/documentation-maintainer.md");

    expect(prompt).toContain("public/docs/user-guide.html");
    expect(prompt).toContain("public/docs/staff-guide.html");
    expect(prompt).toContain("public/docs/portal-guide.html");
    expect(prompt).toContain("every current user-facing route");
    expect(prompt).toContain("Do not limit the review to the merged diff");
    expect(prompt).toContain("Edit only those three HTML files");
    expect(prompt).toContain("fields, choices, defaults, units, and limits");
    expect(prompt).toContain("success, empty, validation, permission, and failure states");
  });

  it("publishes guide changes through one scoped pull-request branch", () => {
    const workflow = read(".github/workflows/documentation-agent.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("github.event.pull_request.merge_commit_sha || github.sha");
    expect(workflow).toContain('EVENT_NAME: ${{ github.event_name }}');
    expect(workflow).toContain("manual documentation audit");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("Edit(public/docs/staff-guide.html)");
    expect(workflow).toContain("Write(public/docs/portal-guide.html)");
    expect(workflow).toContain("documentation/user-guide");
    // Staged, not working-tree: git diff never sees a guide the agent creates
    // rather than edits, so the run reported no changes and binned the work.
    expect(workflow).toContain("git add -A");
    expect(workflow).toContain("git diff --cached --name-only");
    // A GITHUB_TOKEN push does not trigger workflows, so the docs PR never ran
    // ci.yml. The App token's pushes do.
    expect(workflow).toContain("actions/create-github-app-token");
    expect(workflow).toContain("GH_TOKEN: ${{ steps.mgr-app.outputs.token }}");
    expect(workflow).toContain("token: ${{ steps.mgr-app.outputs.token }}");
    expect(workflow).toContain("public/docs/user-guide.html public/docs/staff-guide.html public/docs/portal-guide.html");
    expect(workflow).toContain("gh pr create");
    expect(workflow).toContain("<(script|base|link|iframe");
    expect(workflow).toContain("http-equiv");
    expect(workflow).toContain("@import");
    expect(workflow).not.toContain("issues: read");
    expect(workflow).not.toContain("issues: write");
    expect(workflow).not.toContain("--json-schema");
  });
});

// tests/documentation-agent.test.ts — keeps the guide suite and its post-merge maintainer comprehensive, scoped, and reviewable.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listTools } from "@/lib/commands/registry";
import "@/lib/commands/all";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("HTTP API documentation", () => {
  it("has one catalog containing every registered operation", () => {
    const readme = read("README.md");
    expect(readme.match(/^## HTTP API$/gm)).toHaveLength(1);
    const api = readme.match(/^## HTTP API[\s\S]*?(?=^## )/m)?.[0];
    expect(api).toBeDefined();

    for (const { name } of listTools()) {
      expect(api, `${name} is missing from README.md HTTP API`).toContain(`\`${name}\``);
    }
  });
});

describe("post-merge documentation maintainer", () => {
  it("audits the complete live UI and may edit only the MDX guide suite", () => {
    const prompt = read(".agents/agents/documentation-maintainer.md");

    expect(prompt).toContain("content/docs/index.mdx");
    expect(prompt).toContain("content/docs/staff-guide.mdx");
    expect(prompt).toContain("content/docs/portal-guide.mdx");
    expect(prompt).toContain("every current user-facing route");
    expect(prompt).toContain("Do not limit the review to the merged diff");
    expect(prompt).toContain("Edit only those three MDX files");
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
    // The agent may write only the guides, and only vitest specifies their
    // shape: a second copy of those rules in shell would drift (see the
    // workflow's validate step).
    expect(workflow).toContain("content/docs/(index|staff-guide|portal-guide)");
    expect(workflow).toMatch(/Edit\(content\/docs\/[a-z-]+\.mdx\)/);
    expect(workflow).not.toMatch(/grep[^\n]*\$guide/);
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
    expect(workflow).toContain("gh pr create");
    expect(workflow).not.toContain("issues: read");
    expect(workflow).not.toContain("issues: write");
    expect(workflow).not.toContain("--json-schema");
  });
});

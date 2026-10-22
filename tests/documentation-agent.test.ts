// tests/documentation-agent.test.ts — keeps the guide suite and its post-merge
// maintainer comprehensive, scoped, and reviewable. The HTTP API reference is
// gated by tests/api-docs.test.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// yaml is installed through fumadocs, as in dreaming-workflow.test.ts; no new dependency.
import { parse } from "yaml";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("post-merge documentation maintainer", () => {
  it("audits the complete live UI and may edit only the MDX guide suite", () => {
    const prompt = read(".agents/agents/documentation-maintainer.md");

    expect(prompt).toContain("content/docs/index.mdx");
    expect(prompt).toContain("content/docs/staff-guide.mdx");
    expect(prompt).toContain("content/docs/portal-guide.mdx");
    expect(prompt).toContain("every current user-facing route");
    expect(prompt).toContain("Do not limit the review to the merged diff");
    expect(prompt).toContain("Edit only those three MDX files, plus `README.md` and the `docs/` pages listed");
    expect(prompt).toContain("fields, choices, defaults, units, and limits");
    expect(prompt).toContain("success, empty, validation, permission, and failure states");
  });

  // PR #181 rewrote two reconciled sentences back into a formal register and
  // deleted the "Coming up" section while its screen was still in the
  // inventory. The prompt described structure but never voice, and told the
  // agent to remove stale claims without saying how to tell stale from
  // merely differently worded.
  it("fixes the guides' voice so a rerun does not drift it back", () => {
    const prompt = read(".agents/agents/documentation-maintainer.md");

    expect(prompt).toContain("## Voice");
    expect(prompt).toContain("no em dashes");
    expect(prompt).toContain("Rewriting a correct sentence into a more formal one is a regression");
  });

  it("removes a section only when the screen behind it is gone", () => {
    const prompt = read(".agents/agents/documentation-maintainer.md");

    expect(prompt).toContain("still names a screen in `components/mgr/screens.tsx`");
  });

  it("publishes guide changes through one scoped pull-request branch", () => {
    const workflow = read(".github/workflows/documentation-agent.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("github.event.pull_request.merge_commit_sha || github.sha");
    expect(workflow).toContain('EVENT_NAME: ${{ github.event_name }}');
    // A dispatched run is labelled "manual"; a scheduled one keeps its event name.
    expect(workflow).toContain("${EVENT_NAME/workflow_dispatch/manual} documentation audit");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pull-requests: write");
    // The agent may write only the guides, README.md, and the docs/ pages a
    // change added (enforced in the validate step), and only vitest specifies the guides'
    // shape: a second copy of those rules in shell would drift (see the
    // workflow's validate step).
    expect(workflow).toContain("content/docs/index.mdx content/docs/staff-guide.mdx content/docs/portal-guide.mdx README.md");
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
    expect(workflow).not.toContain("--json-schema");
  });

  it("integrates added Markdown and reports what it overlooked through a deterministic job", () => {
    const prompt = read(".agents/agents/documentation-maintainer.md");
    const source = read(".github/workflows/documentation-agent.yml");
    const jobs = (parse(source) as { jobs: Record<string, { permissions: Record<string, string> }> }).jobs;

    expect(source).toContain("--diff-filter=A HEAD^1 HEAD -- '*.md' '*.mdx' > \"$RUNNER_TEMP/added-docs.txt\"");
    // Plans describe unshipped work; .agents/ is dreaming's; content/docs/api/ is the HTTP API agent's.
    expect(source).toContain("grep -Ev '^(docs/plans/|\\.agents/|content/docs/api/)|^$'");
    // Validation reads the copy written before the model ran, never the working-tree file.
    expect(source).toContain("grep -E '^docs/.+\\.md$' \"$RUNNER_TEMP/new-docs.txt\"");
    expect(prompt).toContain("## New documentation");
    expect(prompt).toContain(".docs-agent-findings.jsonl");
    // Only the report job may write issues; the model job never can.
    expect(jobs.maintain.permissions.issues).toBeUndefined();
    expect(jobs.report.permissions.issues).toBe("write");
    expect(source).toContain('scripts/file-doc-findings.sh "$RUNNER_TEMP/doc-findings.jsonl"');
    // A run whose guide edits fail validation still reports what it found.
    expect(source).toContain("if: always() && needs.maintain.outputs.findings == 'true'");
    expect(source).toContain("if: always() && steps.validate.outputs.findings == 'true'");
  });
});

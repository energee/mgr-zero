import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("dreaming workflow", () => {
  it("batches curation and leaves publication to a deterministic job", () => {
    const workflow = read(".github/workflows/dreaming.yml");
    const prompt = read(".agents/agents/dreaming.md");

    expect(workflow).not.toMatch(/^  push:/m);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("publish:\n    needs: maintain");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("actions/download-artifact");
    expect(workflow).toContain('EXPECTED_PR: ${{ needs.maintain.outputs.open_pr }}');
    expect(workflow).toContain('current_pr=$(gh pr list');
    expect(workflow).toContain('if [ "$current_pr" != "$EXPECTED_PR" ]');
    expect(workflow).toContain("git add -A");
    expect(workflow).toContain("git diff --cached --name-only");
    expect(workflow.split("Dream changed forbidden path")).toHaveLength(3);
    expect(workflow).toContain("refs/dreaming/last-checked");

    const modelArgs = workflow.match(/claude_args: '([^']+)'/)?.[1] ?? "";
    expect(modelArgs).not.toMatch(/git (add|commit|checkout|push)|gh pr (create|edit)/);
    expect(prompt).not.toContain("## Publish");
  });

  it("ships the dream as a patch so concurrent main edits survive publication", () => {
    const workflow = read(".github/workflows/dreaming.yml");

    expect(workflow).toContain("git diff --cached --binary > dream.patch");
    expect(workflow).toContain("git apply --3way --index");
    expect(workflow).not.toMatch(/path: \|\n\s+\.agents\/MEMORY\.md/);
  });

  it("recovers from a conflicting dreaming/main instead of failing every run", () => {
    const workflow = read(".github/workflows/dreaming.yml");

    expect(workflow.split("git merge --abort")).toHaveLength(3);
    expect(workflow).not.toMatch(/^\s+git push origin dreaming\/main$/m);
  });

  it("hardens the model job like the documentation agent", () => {
    const workflow = read(".github/workflows/dreaming.yml");
    const docsAgent = read(".github/workflows/documentation-agent.yml");
    const denyBlock = docsAgent.match(/"deny": \[[^\]]+\]/)?.[0];

    expect(denyBlock).toBeTruthy();
    expect(workflow).toContain(denyBlock);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("show_full_output: false");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).toMatch(
      /name: Run dream[\s\S]*?GH_TOKEN: \$\{\{ github\.token \}\}[\s\S]*?name: Validate dream changes/
    );
  });

  it("does not re-dream an empty window or swallow bot identity lookups", () => {
    const workflow = read(".github/workflows/dreaming.yml");

    expect(workflow).toContain('[ "$base" = "$head" ]');
    expect(workflow).toContain('id="$(gh api "users/${login}" --jq .id)"');
  });

  it("persists drift in a structured file the agent may prune", () => {
    const prompt = read(".agents/agents/dreaming.md");
    const architecture = read(".agents/ARCHITECTURE.md");
    const drift = read(".agents/DRIFT.md");
    const readme = read("README.md");
    const agents = read("AGENTS.md");

    expect(prompt).toContain(".agents/DRIFT.md");
    expect(prompt).toMatch(/digests[\s\S]{0,40}(if any|when present|may be\s+none)/i);
    expect(agents).toContain(".agents/DRIFT.md");
    expect(architecture).toContain("| `lib/chat/` |");
    expect(readme).toContain("`get_today`");
    for (const line of drift.split("\n").filter((l) => l.startsWith("-"))) {
      expect(line).toMatch(/^- \[ \] /);
    }
  });
});

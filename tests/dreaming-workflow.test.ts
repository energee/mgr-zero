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

  it("persists drift and restores the lost chat ownership context", () => {
    const prompt = read(".agents/agents/dreaming.md");
    const architecture = read(".agents/ARCHITECTURE.md");
    const memory = read(".agents/MEMORY.md");
    const agents = read("AGENTS.md");
    const drift = read(".agents/DRIFT.md");
    const readme = read("README.md");

    expect(prompt).toContain(".agents/DRIFT.md");
    expect(prompt).toContain("not a changelog");
    expect(prompt).toMatch(/already\s+protected by a regression test/);
    expect(architecture).toContain("| `lib/chat/` |");
    expect(memory).toContain("Chat notifications are staff-only");
    expect(agents).toContain("Chat notifications (Slack today, provider-neutral design)");
    expect(readme).toContain("`get_today`");
    expect(drift).not.toContain("`get_today`");
    expect(drift).toContain("not_in_inventory");
    expect(drift).toContain("Taproom loss attribution");
  });
});

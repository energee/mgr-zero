import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
// ponytail: js-yaml is already installed transitively (eslint); a real parser without a new dependency.
const { load } = createRequire(import.meta.url)("js-yaml") as { load: (source: string) => unknown };

describe("dreaming workflow", () => {
  it("is valid YAML (a column-0 line inside a `run: |` block once broke the file)", () => {
    for (const file of [".github/workflows/dreaming.yml", ".github/workflows/documentation-agent.yml"]) {
      expect(() => load(read(file))).not.toThrow();
    }
  });

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
    expect(workflow).toContain('[ "$current_pr" = "$EXPECTED_PR" ]');
    expect(workflow).toContain("git add -A");
    expect(workflow).toContain("git diff --cached --name-only");
    // The editable-path check runs once, in maintain; publish ships that exact commit.
    expect(workflow.split("Dream changed forbidden path")).toHaveLength(2);
    expect(workflow).toContain("refs/dreaming/last-checked");

    const modelArgs = workflow.match(/claude_args: '([^']+)'/)?.[1] ?? "";
    expect(modelArgs).not.toMatch(/git (add|commit|checkout|push)|gh pr (create|edit)/);
    expect(prompt).not.toContain("## Publish");
  });

  it("ships the validated dream commit as a bundle so publish never re-merges or 3-way applies", () => {
    const workflow = read(".github/workflows/dreaming.yml");

    expect(workflow).toContain('git bundle create dream.bundle HEAD ^origin/main ${DREAM_SHA:+^$DREAM_SHA}');
    expect(workflow).toContain('git fetch "$RUNNER_TEMP/dream.bundle" HEAD');
    expect(workflow).toContain("git checkout -B dreaming/main FETCH_HEAD");
    expect(workflow).not.toContain("git apply");
    expect(workflow).not.toContain("dream.patch");
    // One merge decision, made in maintain; publish does not re-derive it.
    expect(workflow.split("git merge --no-edit origin/main")).toHaveLength(2);
    // Publish does nothing but advance the marker when the dream changed nothing.
    expect(workflow).toMatch(
      /name: Publish dream pull request\n\s+if: needs\.maintain\.outputs\.changed == 'true'/
    );
  });

  it("recovers from a conflicting dreaming/main without a silent rebuild", () => {
    const workflow = read(".github/workflows/dreaming.yml");

    // `git merge --abort` fails under set -e when the merge never started.
    expect(workflow).toContain("git merge --abort || true");
    expect(workflow).toContain("::warning::dreaming/main no longer merges");
    expect(workflow).toContain("rebuilt=$rebuilt");
    expect(workflow).toContain('REBUILT: ${{ needs.maintain.outputs.rebuilt }}');
  });

  it("only overwrites the dreaming/main head that maintain observed", () => {
    const workflow = read(".github/workflows/dreaming.yml");

    expect(workflow).toContain("dream_sha=$(git rev-parse -q --verify origin/dreaming/main || true)");
    expect(workflow).toContain('EXPECTED_SHA: ${{ needs.maintain.outputs.dream_sha }}');
    expect(workflow).toContain(
      'git push --force-with-lease="refs/heads/dreaming/main:${EXPECTED_SHA}" origin dreaming/main'
    );
    expect(workflow).not.toMatch(/git push (-f|--force) origin dreaming\/main/);
  });

  it("hardens the model job like the documentation agent", () => {
    const workflow = read(".github/workflows/dreaming.yml");
    const docsAgent = read(".github/workflows/documentation-agent.yml");
    const settings = JSON.parse(read(".github/claude-ci-settings.json")) as {
      permissions: { deny: string[] };
    };

    expect(docsAgent).toContain("settings: .github/claude-ci-settings.json");
    // The dream runs on a checked-out dreaming/main, so its deny list must come from main.
    expect(workflow).toContain('git show origin/main:.github/claude-ci-settings.json > "$RUNNER_TEMP/claude-ci-settings.json"');
    expect(workflow).toContain("settings: ${{ runner.temp }}/claude-ci-settings.json");
    for (const file of [workflow, docsAgent]) {
      expect(file).not.toContain('"deny"');
    }
    expect(settings.permissions.deny).toContain("Read(/home/runner/.ssh/**)");
    expect(settings.permissions.deny).toContain("Grep(**/*token*)");
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

  it("commits every dream commit, merges included, as the MGR GitHub App", () => {
    const workflow = read(".github/workflows/dreaming.yml");

    expect(workflow.split("uses: actions/create-github-app-token@v2")).toHaveLength(3);
    expect(workflow).toContain("permission-metadata: read");
    expect(workflow).not.toContain("github-actions[bot]");
    expect(workflow).not.toContain("--reset-author");
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
    expect(drift).not.toContain("`get_today`");
    for (const line of drift.split("\n").filter((l) => l.startsWith("-"))) {
      expect(line).toMatch(/^- \[ \] /);
    }
  });

  it("keeps the context a dream once pruned (PR #30, restored in PR #60)", () => {
    const prompt = read(".agents/agents/dreaming.md");
    const memory = read(".agents/MEMORY.md");
    const agents = read("AGENTS.md");

    expect(prompt).toContain("not a changelog");
    expect(prompt).toMatch(/already\s+protected by a regression test/);
    expect(memory).toMatch(/Chat notifications are staff-only/);
    expect(agents).toMatch(/^\| Chat notifications \(Slack today, provider-neutral design\) \|/m);
  });
});

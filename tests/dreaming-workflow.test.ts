import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// ponytail: yaml is already installed transitively (fumadocs); a real parser without a new dependency.
import { parse as load } from "yaml";

const read = (path: string) => readFileSync(path, "utf8");

type Workflow = { jobs: Record<"maintain" | "publish", { steps: { name?: string; run?: string }[] }> };
const workflow = load(read(".github/workflows/dreaming.yml")) as Workflow;
const validation = workflow.jobs.maintain.steps.find((step) => step.name === "Validate dream changes")!.run!;
const publication = workflow.jobs.publish.steps.find((step) => step.name === "Publish dream pull request")!.run!;
// Exercise the real trust boundary, stopping before authenticated remote publication.
const publishShell = publication.slice(publication.indexOf("git fetch"), publication.indexOf('body="'));
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_")) delete env[key];
}

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function checkBundle(
  edit: (repo: string) => void,
  check: (result: { published: SpawnSyncReturns<string>; publisher: string; base: string }) => void,
  advanceMain = false,
) {
  const root = mkdtempSync(join(tmpdir(), "dream-bundle-"));
  const producer = join(root, "producer");
  const publisher = join(root, "publisher");
  try {
    mkdirSync(join(producer, ".agents/agents"), { recursive: true });
    git(producer, "init", "-b", "main");
    git(producer, "config", "user.name", "Fixture");
    git(producer, "config", "user.email", "fixture@example.invalid");
    git(producer, "config", "core.hooksPath", "/dev/null");
    writeFileSync(join(producer, "AGENTS.md"), "original\n");
    git(producer, "add", ".");
    git(producer, "commit", "-m", "trusted main");
    const base = git(producer, "rev-parse", "HEAD");
    git(producer, "update-ref", "refs/remotes/origin/main", base);
    git(root, "clone", producer, publisher);
    edit(producer);
    const validated = spawnSync("bash", ["-e", "-o", "pipefail", "-c", validation], {
      cwd: producer,
      env: { ...env, GITHUB_OUTPUT: join(root, "output"), DREAM_SHA: "", DREAM_LOGIN: "Fixture", DREAM_EMAIL: "fixture@example.invalid" },
      encoding: "utf8",
    });
    expect(validated.status, validated.stderr).toBe(0);
    expect(read(join(root, "output"))).toContain("changed=true");
    if (advanceMain) {
      writeFileSync(join(publisher, "application.ts"), "new main code\n");
      git(publisher, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "add", ".");
      git(publisher, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "intervening main");
      git(publisher, "update-ref", "refs/remotes/origin/main", "HEAD");
    }
    const published = spawnSync("bash", ["-e", "-o", "pipefail", "-c", publishShell], {
      cwd: publisher,
      env: { ...env, RUNNER_TEMP: producer, TRUSTED_BASE: base },
      encoding: "utf8",
    });
    check({ published, publisher, base });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("dreaming workflow", () => {
  it("is valid YAML (a column-0 line inside a `run: |` block once broke the file)", () => {
    for (const file of [".github/workflows/dreaming.yml", ".github/workflows/documentation-agent.yml"]) {
      expect(() => load(read(file))).not.toThrow();
    }
  });

  it("lets the validate step accept every file the mechanical TODO step writes", () => {
    // The script runs before validation; a path missing here fails every run that moves an item.
    const written = [...read("scripts/pr-directives.ts").matchAll(/writeFileSync\("([^"]+)"/g)].map((m) => m[1]);
    const allowlist = read(".github/workflows/dreaming.yml").match(/case "\$path" in\n\s+(\S+)\) ;;/)?.[1].split("|") ?? [];

    expect(written).toEqual(expect.arrayContaining(["TODO.md", ".agents/PROGRESS.md"]));
    for (const path of written) expect(allowlist).toContain(path);
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
    // Maintain gives early staged feedback; publish independently checks the full tree.
    expect(workflow).toContain("Dream changed forbidden path");
    expect(workflow).toContain("Dream bundle changed forbidden path");
    expect(workflow).toContain("refs/dreaming/last-checked");

    const modelArgs = workflow.match(/claude_args: '([^']+)'/)?.[1] ?? "";
    expect(modelArgs).not.toContain("Bash(git ");
    expect(modelArgs).not.toMatch(/gh pr (create|edit)/);
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
    // CI agents check out the repo, so the local-dev Bash allowlist would apply to them too.
    const local = JSON.parse(read(".claude/settings.json")) as { permissions: { allow: string[] } };
    for (const rule of local.permissions.allow.filter((r) => r.startsWith("Bash("))) {
      expect(settings.permissions.deny).toContain(rule);
    }
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
    // A contradiction the agent resolved is written where the fact belongs and
    // leaves the ledger; the pair is the invariant, not the filename. The
    // command table this once pinned to README is now the generated HTTP API
    // reference and README only links to it, so follow the content there.
    expect(read("content/docs/api/today.mdx")).toContain("`get_today`");
    expect(readme).toContain("/docs/api");
    expect(drift).not.toContain("`get_today`");
    for (const line of drift.split("\n").filter((l) => l.startsWith("-"))) {
      expect(line).toMatch(/^- \[ \] /);
    }
  });

  it("feeds recurring review and watchdog friction back into the agent docs", () => {
    const prompt = read(".agents/agents/dreaming.md");
    const workflow = read(".github/workflows/dreaming.yml");

    // gh issue is blocked for the model, so the workflow hands it the open watchdog issues.
    expect(workflow).toContain("Collect open watchdog issues");
    expect(workflow).toContain("WATCHDOG_ISSUES");
    expect(prompt).toContain("## Recurring friction");
    expect(prompt).toMatch(/gh pr view <n> --json reviews,comments/);
    expect(prompt).toMatch(/two or more/i);
  });

  it("captures Git evidence before the model without staging it", () => {
    const capture = workflow.jobs.maintain.steps.findIndex((step) => step.name === "Capture trusted Git evidence");
    const dream = workflow.jobs.maintain.steps.findIndex((step) => step.name === "Run dream");
    expect(capture).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(dream);
    expect(workflow.jobs.maintain.steps[capture].run).toContain('git --no-pager log --no-ext-diff --stat "$ACCEPTED_BASE..$MAIN_HEAD" > .git/dream-evidence.log');
    expect(read(".agents/agents/dreaming.md")).toContain("Read `.git/dream-evidence.log`");
  });

  it("rejects a forbidden precommitted file hidden behind an allowed staged document", () => {
    checkBundle((repo) => {
      writeFileSync(join(repo, "application.ts"), "forbidden\n");
      git(repo, "add", ".");
      git(repo, "commit", "-m", "hidden forbidden change");
      writeFileSync(join(repo, "AGENTS.md"), "allowed staged doc\n");
    }, ({ published, publisher, base }) => {
      expect(published.status).toBe(1);
      expect(published.stdout?.toString()).toContain("Dream bundle changed forbidden path: application.ts");
      expect(git(publisher, "rev-parse", "HEAD")).toBe(base);
      expect(existsSync(join(publisher, "application.ts"))).toBe(false);
    });
  });

  it.each([false, true])("accepts the exact allowed tree with intervening main=%s", (advanceMain) => {
    checkBundle((repo) => {
      writeFileSync(join(repo, ".agents/agents/example.md"), "allowed agent instructions\n");
      writeFileSync(join(repo, "AGENTS.md"), "curated\n");
    }, ({ published, publisher, base }) => {
      expect(published.status, published.stderr?.toString()).toBe(0);
      expect(read(join(publisher, "AGENTS.md"))).toBe("curated\n");
      expect(git(publisher, "diff", "--name-only", base, "HEAD")).toBe(".agents/agents/example.md\nAGENTS.md");
    }, advanceMain);
  });

  it("rejects a bundle without the recorded trusted ancestor", () => {
    checkBundle((repo) => {
      git(repo, "checkout", "--orphan", "unrelated");
      git(repo, "commit", "-m", "unrelated root");
      writeFileSync(join(repo, "AGENTS.md"), "allowed staged doc\n");
    }, ({ published, publisher, base }) => {
      expect(published.status).toBe(1);
      expect(published.stdout?.toString()).toContain("does not descend from the recorded main head");
      expect(git(publisher, "rev-parse", "HEAD")).toBe(base);
    });
  });

  it("rejects a symlink masquerading as allowed Markdown", () => {
    checkBundle((repo) => {
      rmSync(join(repo, "AGENTS.md"));
      symlinkSync("/synthetic/forbidden-target", join(repo, "AGENTS.md"));
    }, ({ published }) => {
      expect(published.status).toBe(1);
      expect(published.stdout?.toString()).toContain("Dream bundle changed document type: AGENTS.md (120000)");
    });
  });

  it.each([".agents/agents/nested/forbidden.md", "forbidden\nAGENTS.md"])("rejects non-allowlisted path %j", (path) => {
    checkBundle((repo) => {
      mkdirSync(join(repo, ".agents/agents/nested"), { recursive: true });
      writeFileSync(join(repo, path), "forbidden\n");
      git(repo, "add", ".");
      git(repo, "commit", "-m", "hidden forbidden path");
      writeFileSync(join(repo, "AGENTS.md"), "allowed staged doc\n");
    }, ({ published, publisher, base }) => {
      expect(published.status).toBe(1);
      expect(published.stdout?.toString()).toContain("Dream bundle changed forbidden path:");
      expect(git(publisher, "rev-parse", "HEAD")).toBe(base);
    });
  });

  it("accepts deletion of an allowed document", () => {
    checkBundle((repo) => rmSync(join(repo, "AGENTS.md")), ({ published, publisher }) => {
      expect(published.status, published.stderr?.toString()).toBe(0);
      expect(existsSync(join(publisher, "AGENTS.md"))).toBe(false);
    });
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

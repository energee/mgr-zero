import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// ponytail: yaml is already installed transitively (fumadocs); a real parser without a new dependency.
import { parse as load } from "yaml";

const read = (path: string) => readFileSync(path, "utf8");

type Workflow = {
  jobs: Record<"maintain" | "publish", { steps: { name?: string; run?: string; env?: Record<string, string> }[] }>;
};
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
      env: { ...env, GITHUB_OUTPUT: join(root, "output"), RUNNER_TEMP: root, DREAM_SHA: "", DREAM_LOGIN: "Fixture", DREAM_EMAIL: "fixture@example.invalid" },
      encoding: "utf8",
    });
    expect(validated.status, validated.stderr).toBe(0);
    expect(read(join(root, "output"))).toContain("changed=true");
    if (advanceMain) {
      writeFileSync(join(publisher, "application.ts"), "new main code\n");
      git(publisher, "add", ".");
      git(publisher, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "intervening main");
      git(publisher, "update-ref", "refs/remotes/origin/main", "HEAD");
    }
    const published = spawnSync("bash", ["-e", "-o", "pipefail", "-c", publishShell], {
      cwd: publisher,
      env: { ...env, RUNNER_TEMP: producer, TRUSTED_BASE: base, DREAM_LOGIN: "Fixture", DREAM_EMAIL: "fixture@example.invalid" },
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

  it("runs only from main and leaves publication to the deterministic job", () => {
    const source = read(".github/workflows/dreaming.yml");

    expect(source).not.toMatch(/^  push:/m);
    expect(source).toContain("if: github.ref == 'refs/heads/main'");
    const modelArgs = source.match(/claude_args: '([^']+)'/)?.[1] ?? "";
    expect(modelArgs).not.toMatch(/git (add|commit|checkout|push)|gh pr (create|edit)/);
    expect(modelArgs).toContain('--disallowedTools "Bash(git:*)"');
    expect(modelArgs).toContain("--permission-mode dontAsk");
    expect(read(".agents/agents/dreaming.md")).not.toContain("## Publish");
  });

  it("dreams on the recorded main head when no dream PR is open", () => {
    // Checkout pins github.sha, which lags origin/main when main moves while the run queues;
    // the publish ancestry check against the recorded head would then reject the bundle.
    const prepare = workflow.jobs.maintain.steps.find((step) => step.name === "Prepare cumulative dream documents")!;
    expect(prepare.env?.MAIN_HEAD).toBe("${{ steps.window.outputs.head }}");
    expect(prepare.run).toMatch(/else\n(\s+#.*\n)*\s+git checkout -B dreaming\/main "\$MAIN_HEAD"\nfi/);
  });

  it("lets the validate step accept every file the mechanical TODO step writes", () => {
    // The script runs before validation; a path missing here fails every run that moves an item.
    const written = [...read("scripts/pr-directives.ts").matchAll(/writeFileSync\("([^"]+)"/g)].map((m) => m[1]);
    const allowlist = read(".github/workflows/dreaming.yml").match(/case "\$path" in\n\s+(\S+)\) ;;/)?.[1].split("|") ?? [];

    expect(written).toEqual(expect.arrayContaining(["TODO.md", ".agents/PROGRESS.md"]));
    for (const path of written) expect(allowlist).toContain(path);
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

    const jobs = load(workflow).jobs as Record<string, { steps: { uses?: string }[] }>;
    const appTokenSteps = Object.values(jobs).flatMap((job) => job.steps)
      .filter((step) => step.uses?.startsWith("actions/create-github-app-token@"));
    expect(appTokenSteps).toHaveLength(2);
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

  it("captures only the trusted Git window without staging its evidence", () => {
    const repo = mkdtempSync(join(tmpdir(), "dream-evidence-"));
    try {
      git(repo, "init", "-b", "main");
      git(repo, "config", "user.name", "Fixture");
      git(repo, "config", "user.email", "fixture@example.invalid");
      git(repo, "config", "core.hooksPath", "/dev/null");
      writeFileSync(join(repo, "AGENTS.md"), "original\n");
      git(repo, "add", ".");
      git(repo, "commit", "-m", "before the window");
      const base = git(repo, "rev-parse", "HEAD");
      writeFileSync(join(repo, "changed.md"), "new evidence\n");
      git(repo, "add", ".");
      git(repo, "commit", "-m", "inside the window");
      const head = git(repo, "rev-parse", "HEAD");
      const capture = workflow.jobs.maintain.steps.find((step) => step.name === "Capture trusted Git evidence")!.run!;
      const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", capture], {
        cwd: repo, env: { ...env, ACCEPTED_BASE: base, MAIN_HEAD: head }, encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      const evidence = read(join(repo, ".git/dream-evidence.log"));
      expect(evidence).toContain(head);
      expect(evidence).not.toContain(base);
      expect(evidence).toContain("changed.md");
      git(repo, "add", "-A");
      expect(git(repo, "diff", "--cached", "--name-only")).toBe("");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
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

  it("does not publish forbidden content hidden in an intermediate producer commit", () => {
    checkBundle((repo) => {
      writeFileSync(join(repo, "application.ts"), "harmless private sentinel\n");
      git(repo, "add", ".");
      git(repo, "commit", "-m", "forbidden intermediate content");
      git(repo, "rm", "application.ts");
      git(repo, "commit", "-m", "remove intermediate content");
      writeFileSync(join(repo, "AGENTS.md"), "allowed curated document\n");
    }, ({ published, publisher, base }) => {
      expect(published.status, published.stderr?.toString()).toBe(0);
      expect(read(join(publisher, "AGENTS.md"))).toBe("allowed curated document\n");
      expect(git(publisher, "log", "--format=%H", `${base}..HEAD`, "--", "application.ts")).toBe("");
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

  it.each(["AGENTS.md", ".agents/agents/[ab].md"])("rejects a symlink masquerading as allowed Markdown: %s", (path) => {
    checkBundle((repo) => {
      if (existsSync(join(repo, path))) rmSync(join(repo, path));
      symlinkSync("/synthetic/forbidden-target", join(repo, path));
    }, ({ published, publisher, base }) => {
      expect(published.status).toBe(1);
      expect(git(publisher, "rev-parse", "HEAD")).toBe(base);
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

  it("integrates new documentation and reports gaps through a deterministic job", () => {
    const prompt = read(".agents/agents/dreaming.md");
    const source = read(".github/workflows/dreaming.yml");
    const jobs = (load(source) as { jobs: Record<string, { permissions: Record<string, string> }> }).jobs;

    expect(source).toContain("--diff-filter=A \"$ACCEPTED_BASE\" \"$MAIN_HEAD\" -- '*.md' '*.mdx' > .git/dream-new-docs.txt");
    expect(prompt).toContain("## Integrate new and missed documentation");
    expect(prompt).toContain(".dream-findings.jsonl");
    expect(jobs.maintain.permissions.issues).toBe("read");
    expect(jobs.report.permissions.issues).toBe("write");
    expect(source).toContain('scripts/file-doc-findings.sh "$RUNNER_TEMP/dream-findings.jsonl"');
  });

  it("keeps findings out of the dream and accepts integrated specs", () => {
    checkBundle((repo) => {
      mkdirSync(join(repo, ".agents/superpowers/specs"), { recursive: true });
      writeFileSync(join(repo, ".agents/superpowers/specs/a.md"), "linked\n");
      writeFileSync(join(repo, ".dream-findings.jsonl"), '{"title":"x","body":"y"}\n');
    }, ({ published, publisher, base }) => {
      expect(published.status, published.stderr?.toString()).toBe(0);
      expect(git(publisher, "diff", "--name-only", base, "HEAD")).toBe(".agents/superpowers/specs/a.md");
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

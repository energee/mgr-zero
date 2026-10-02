// Exercises the documentation workflow's real publication shell across an intervening main update.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// js-yaml is installed through eslint, as in dreaming-workflow.test.ts; no new dependency.
const { load } = createRequire(import.meta.url)("js-yaml") as { load: (source: string) => Workflow };
type Step = { name?: string; uses?: string; run?: string; with?: { path?: string; "fetch-depth"?: number } };
type Workflow = { jobs: { maintain: { steps: Step[] }; publish: { steps: Step[] } } };
const source = readFileSync(".github/workflows/documentation-agent.yml", "utf8");
const workflow = load(source);
const guides = ["index", "staff-guide", "portal-guide"].map((name) => `content/docs/${name}.mdx`);
// Hooks export GIT_DIR and friends; never let fixture commands reach the real repository.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_")) delete env[key];
}

function command(cwd: string, executable: string, args: string[]) {
  return spawnSync(executable, args, { cwd, env, encoding: "utf8" });
}
function git(cwd: string, ...args: string[]) {
  const result = command(cwd, "git", args);
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function publication(root: string, edit: (repo: string) => void, intervene?: (repo: string) => void) {
  const repo = join(root, "repo");
  mkdirSync(join(repo, "content/docs"), { recursive: true });
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "core.hooksPath", "/dev/null");
  for (const guide of guides) writeFileSync(join(repo, guide), "original\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "A audited revision");
  edit(repo);
  const output = join(root, "output");
  const validation = workflow.jobs.maintain.steps.find((step) => step.name === "Validate the generated guide")!.run!;
  const validated = spawnSync("bash", ["-e", "-o", "pipefail", "-c", validation], {
    cwd: repo,
    env: { ...env, GITHUB_OUTPUT: output },
    encoding: "utf8",
  });
  if (validated.status !== 0 || readFileSync(output, "utf8").includes("changed=false")) {
    return { root, repo, validated, published: undefined, before: git(repo, "rev-parse", "HEAD") };
  }
  const artifactPath = workflow.jobs.maintain.steps.find((step) => step.uses?.startsWith("actions/upload-artifact"))!.with!.path!;
  const artifact = join(root, "artifact");
  cpSync(join(repo, artifactPath), artifact, { recursive: true });
  rmSync(join(repo, artifactPath), { recursive: true, force: true });
  git(repo, "reset", "--hard", "HEAD");
  if (intervene) {
    intervene(repo);
    git(repo, "add", ".");
    git(repo, "commit", "-m", "B intervening update");
  }
  const before = git(repo, "rev-parse", "HEAD");
  expect(existsSync(join(repo, artifactPath))).toBe(false);
  expect(git(repo, "ls-tree", "--name-only", "HEAD", artifactPath)).toBe("");
  const downloadPath = workflow.jobs.publish.steps.find((step) => step.uses?.startsWith("actions/download-artifact"))!.with!.path;
  cpSync(artifact, join(repo, downloadPath ?? artifactPath), { recursive: true });
  const publish = workflow.jobs.publish.steps.find((step) => step.name === "Publish documentation pull request")!.run!;
  // Stop before all remote operations, but retain the actual apply and no-op guard.
  const shell = publish.slice(publish.indexOf("git checkout -B"), publish.indexOf('if [ "$EVENT_NAME"'));
  const published = command(repo, "bash", ["-e", "-o", "pipefail", "-c", `${shell}\ngit commit -m 'publication'`]);
  return { root, repo, validated, published, before };
}

function checkPublication(edit: (repo: string) => void, check: (result: ReturnType<typeof publication>) => void, intervene?: (repo: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "docs-publication-"));
  try {
    check(publication(root, edit, intervene));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("documentation agent workflow", () => {
  it("runs only for main merges and publishes from fresh main with pre-image history", () => {
    expect(source).toContain("github.event.pull_request.base.ref == 'main'");
    expect(source).toContain("ref: main\n          token:");
    expect(workflow.jobs.publish.steps.find((step) => step.uses?.startsWith("actions/checkout"))!.with!["fetch-depth"]).toBe(0);
  });

  it("preserves an untouched guide updated in B while publishing the A audit change", () => {
    checkPublication(
      (repo) => writeFileSync(join(repo, guides[1]), "agent correction\n"),
      ({ repo, published }) => {
        expect(published?.status, published?.stderr).toBe(0);
        expect(readFileSync(join(repo, guides[2]), "utf8")).toBe("new main prose\n");
        expect(readFileSync(join(repo, guides[1]), "utf8")).toBe("agent correction\n");
        expect(git(repo, "diff", "HEAD^", "HEAD", "--name-only")).toBe(guides[1]);
        expect(git(repo, "ls-tree", "--name-only", "HEAD^", "customer-guide.patch")).toBe("");
      },
      (repo) => writeFileSync(join(repo, guides[2]), "new main prose\n"),
    );
  });

  it("fails a conflicting B edit before committing", () => {
    checkPublication(
      (repo) => writeFileSync(join(repo, guides[1]), "agent correction\n"),
      ({ repo, published, before }) => {
        expect(published?.status).not.toBe(0);
        expect(git(repo, "rev-parse", "HEAD")).toBe(before);
        expect(git(repo, "diff", "--name-only", "--diff-filter=U")).toBe(guides[1]);
      },
      (repo) => writeFileSync(join(repo, guides[1]), "conflicting main prose\n"),
    );
  });

  it("does not commit when B already contains the correction", () => {
    const correction = (repo: string) => writeFileSync(join(repo, guides[1]), "agent correction\n");
    checkPublication(correction, ({ repo, published, before }) => {
      expect(published?.status, published?.stderr).toBe(0);
      expect(git(repo, "rev-parse", "HEAD")).toBe(before);
    }, correction);
  });

  it("does not publish an empty audit", () => {
    checkPublication(() => {}, ({ validated, published }) => {
      expect(validated.status).toBe(0);
      expect(published).toBeUndefined();
    });
  });

  it("rejects edits outside the allowed guide suite before artifact transfer", () => {
    checkPublication((repo) => writeFileSync(join(repo, "content/docs/screens.mdx"), "forbidden\n"), ({ validated, published }) => {
      expect(validated.status).toBe(1);
      expect(validated.stdout).toContain("outside the guide suite");
      expect(published).toBeUndefined();
    });
  });
});

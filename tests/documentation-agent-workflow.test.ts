// Exercises the documentation workflow's real publication shell across an intervening main update.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
// yaml is installed through fumadocs, as in dreaming-workflow.test.ts; no new dependency.
import { parse } from "yaml";

const load = (source: string) => parse(source) as Workflow;
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

function installMdxValidation(repo: string) {
  mkdirSync(join(repo, "tests"), { recursive: true });
  cpSync(resolve("tests/mdx-safety.test.ts"), join(repo, "tests/mdx-safety.test.ts"));
  symlinkSync(resolve("node_modules"), join(repo, "node_modules"), "dir");
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
  // The synthetic repository has no application or database configuration.
  writeFileSync(join(repo, "vitest.config.mts"), 'export default { test: { include: ["tests/mdx-safety.test.ts"] } };\n');
}

function publication(root: string, edit: (repo: string) => void, intervene?: (repo: string) => void) {
  const repo = join(root, "repo");
  mkdirSync(join(repo, "content/docs"), { recursive: true });
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "core.hooksPath", "/dev/null");
  for (const guide of guides) writeFileSync(join(repo, guide), "original\n");
  installMdxValidation(repo);
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

  it.each([
    "{process.env.X}",
    '<Card title={x} />',
    "<include>../../synthetic-outside.txt</include>",
  ])("rejects generated active content before producing a patch: %s", (mdx) => {
    checkPublication(
      (repo) => writeFileSync(join(repo, guides[1]), mdx),
      ({ repo, validated, published }) => {
        expect(validated.status).not.toBe(0);
        expect(published).toBeUndefined();
        expect(existsSync(join(repo, "customer-guide.patch"))).toBe(false);
      },
    );
  });

  it.each([
    ["safe prose", '<Card title="Orders"><Callout type="info">Read on.</Callout></Card>\n\n<Screen name="Orders" />', true],
    ["expression", "{process.env.X}", false],
    ["prop expression", "<Card title={x} />", false],
    ["include", "<include>../../synthetic-outside.txt</include>", false],
  ])("gates API publication patch creation for %s", (_name, mdx, accepted) => {
    const root = mkdtempSync(join(tmpdir(), "api-mdx-publication-"));
    try {
      mkdirSync(join(root, "content/docs/api"), { recursive: true });
      installMdxValidation(root);
      git(root, "init", "-b", "main");
      git(root, "config", "user.name", "Fixture");
      git(root, "config", "user.email", "fixture@example.invalid");
      writeFileSync(join(root, "content/docs/api/index.mdx"), "original\n");
      git(root, "add", ".");
      git(root, "-c", "core.hooksPath=/dev/null", "commit", "-m", "baseline");
      writeFileSync(join(root, "content/docs/api/index.mdx"), mdx);
      git(root, "add", ".");
      const api = load(readFileSync(".github/workflows/http-api-agent.yml", "utf8"));
      const run = api.jobs.maintain.steps.find(step => step.name === "Validate the maintained reference")!.run!;
      // Exercise the real non-evaluating gate through patch creation, without
      // importing the API generator's unrelated command/screen application code.
      const gate = run.slice(run.indexOf("# Parse untrusted"), run.indexOf("# Everything else"));
      const result = command(root, "bash", ["-e", "-o", "pipefail", "-c", gate]);
      expect(result.status === 0, result.stderr).toBe(accepted);
      expect(existsSync(join(root, "api-reference.patch"))).toBe(accepted);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // #864: GitHub transiently rejected the force push ("cannot lock ref"); one failure must not fail the run.
  it.each(["documentation-agent.yml", "http-api-agent.yml"])("%s retries a transiently rejected branch push", (file) => {
    const run = (load(readFileSync(`.github/workflows/${file}`, "utf8")) as Workflow).jobs.publish.steps
      .map((step) => step.run ?? "")
      .find((script) => script.includes("git push -f"))!;
    const start = run.indexOf("for attempt");
    expect(start, "push is not wrapped in a retry loop").toBeGreaterThan(-1);
    const push = run.slice(start, run.indexOf("done", start) + 4);
    const root = mkdtempSync(join(tmpdir(), "docs-push-"));
    try {
      // Stub git and sleep: the first push fails, later pushes succeed.
      writeFileSync(join(root, "git"), `#!/bin/sh\necho push >> "${root}/calls"\n[ "$(wc -l < "${root}/calls")" -gt 1 ]\n`, { mode: 0o755 });
      writeFileSync(join(root, "sleep"), "#!/bin/sh\n", { mode: 0o755 });
      const result = spawnSync("bash", ["-e", "-c", push], { env: { ...env, PATH: `${root}:${env.PATH}` }, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(join(root, "calls"), "utf8").trim().split("\n")).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

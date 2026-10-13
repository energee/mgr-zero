// tests/doc-agent-watch.test.ts — the doc agents fail loudly and re-audit on a clock.
// Dreaming failed 13 days running (9/29–10/11) on one allowlist line and nobody saw it.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const { load } = createRequire(import.meta.url)("js-yaml") as { load: (source: string) => unknown };
type Workflow = { on: Record<string, { workflows?: string[]; types?: string[] } | null>; jobs: Record<string, { if?: string; permissions?: Record<string, string> }> };
const DOC_WORKFLOWS = ["Dreaming", "documentation agent", "http api agent"];

describe("doc agent watch", () => {
  const source = read(".github/workflows/doc-agent-watch.yml");
  const watch = load(source) as Workflow;

  it("watches every doc workflow by its exact name", () => {
    for (const file of ["dreaming", "documentation-agent", "http-api-agent"]) {
      const name = (load(read(`.github/workflows/${file}.yml`)) as { name: string }).name;
      expect(watch.on.workflow_run?.workflows).toContain(name);
    }
    expect(watch.on.workflow_run?.workflows).toEqual(DOC_WORKFLOWS);
    expect(watch.on.workflow_run?.types).toEqual(["completed"]);
  });

  it("opens an issue on a failed run and when dreaming goes stale", () => {
    expect(source).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(watch.on).toHaveProperty("schedule");
    expect(source).toContain("--grep='^dream:'");
    expect(source).toContain("gh issue create");
    // One open issue per problem: a daily failure must not file thirteen.
    expect(source).toContain("gh issue list");
    for (const job of Object.values(watch.jobs)) expect(job.permissions).toEqual({ contents: "read", issues: "write", actions: "read" });
  });

  it("re-audits the guides and the API reference weekly, so a missed merge heals", () => {
    for (const file of ["documentation-agent", "http-api-agent"]) {
      const workflow = load(read(`.github/workflows/${file}.yml`)) as Workflow;
      expect(workflow.on).toHaveProperty("schedule");
      expect(workflow.jobs.maintain.if).toContain("github.event_name == 'schedule'");
    }
  });

  it("lets CI-only merges skip the API agent the way DOCS: none skips the guide agent", () => {
    const api = load(read(".github/workflows/http-api-agent.yml")) as Workflow;
    expect(api.jobs.maintain.if).toContain("!contains(github.event.pull_request.body, 'API: none')");
  });
});

describe("pull request template", () => {
  const template = read(".github/pull_request_template.md");

  it("prompts for the lines dreaming and the doc agents read", () => {
    expect(template).toContain("## Durable decisions (for the dreaming log)");
    expect(template).toMatch(/TODO/);
    expect(template).toMatch(/DOCS/);
    expect(template).toMatch(/API/);
  });

  it("never carries a live directive, which would fire on every PR left unedited", () => {
    // pr-directives matches ^TODO: lines; the workflows match the substrings below.
    expect(template).not.toMatch(/^TODO:/m);
    expect(template).not.toContain("DOCS: none");
    expect(template).not.toContain("API: none");
  });
});

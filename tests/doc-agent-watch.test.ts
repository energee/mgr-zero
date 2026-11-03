// tests/doc-agent-watch.test.ts — the doc agents fail loudly and re-audit on a clock.
// Dreaming failed 13 days running (9/29–10/11) on one allowlist line and nobody saw it.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse as load } from "yaml";

const read = (path: string) => readFileSync(path, "utf8");
type Workflow = { on: Record<string, { workflows?: string[]; types?: string[] } | null>; jobs: Record<string, { if?: string; permissions?: Record<string, string>; steps?: { run?: string }[] }> };

describe("doc agent watch", () => {
  const source = read(".github/workflows/doc-agent-watch.yml");
  const watch = load(source) as Workflow;

  it("watches every doc workflow, and hosted jobs, by its exact name", () => {
    // hosted-jobs failed 20 runs in a row (404 on a stale production build) unnoticed.
    const names = ["dreaming", "documentation-agent", "http-api-agent", "hosted-jobs"].map((f) => (load(read(`.github/workflows/${f}.yml`)) as { name: string }).name);
    expect(watch.on.workflow_run?.workflows).toEqual(names);
    expect(watch.on.workflow_run?.types).toEqual(["completed"]);
  });

  it("opens an issue on a run that did not succeed, and when dreaming goes stale", () => {
    expect(watch.jobs["failed-run"].if).toContain('["failure","timed_out","startup_failure"]');
    expect(watch.on).toHaveProperty("schedule");
    expect(source).toContain("--grep='^dream:'");
    // One open issue per problem: a daily failure must not file thirteen.
    expect(source.match(/gh issue list --state open/g)).toHaveLength(2);
    expect(watch.jobs["failed-run"].permissions).toEqual({ issues: "write", actions: "read" });
    expect(watch.jobs["stale-dream"].permissions).toEqual({ contents: "read", issues: "write" });
  });

  // Runs the failed-run step under bash with a fake gh. The job lookup prints
  // FAILED_JOBS only from call number JOBS_READY_ON (default 1), counted in COUNT_FILE.
  const runFailedRun = (env: Record<string, string>) => {
    const script = watch.jobs["failed-run"].steps![0].run!;
    const fakeGh = `
      sleep() { :; }
      gh() {
        case "$1 $2" in
          "api --paginate")
            n=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$COUNT_FILE"
            if [ "$n" -ge "\${JOBS_READY_ON:-1}" ]; then printf '%s\\n' "$FAILED_JOBS"; fi ;;
          "issue list") if [[ "$*" == *"$EXISTING_TITLE"* ]]; then echo 1598; fi ;;
          "issue create") echo "CREATE $*" ;;
          "issue comment") echo "COMMENT $*" ;;
          *) return 2 ;;
        esac
      }
    `;
    const countFile = join(mkdtempSync(join(tmpdir(), "doc-agent-watch-")), "count");
    return spawnSync("bash", ["-e", "-c", fakeGh + script], {
      encoding: "utf8",
      env: { ...process.env, NAME: "hosted jobs", GH_REPO: "test/repo", RUN_ID: "42", URL: "https://example.test/run/42",
        CONCLUSION: "failure", FAILED_JOBS: "", EXISTING_TITLE: "none", COUNT_FILE: countFile, ...env },
    });
  };

  it("alerts for a different failed hosted worker while leaving repeat failures quiet", () => {
    const result = runFailedRun({ FAILED_JOBS: "order-email\nretention", EXISTING_TITLE: "Hosted job failing: order-email" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hosted job order-email issue #1598 already open; not commenting");
    expect(result.stdout).toContain("CREATE issue create --title Hosted job failing: retention");
    expect(result.stdout).not.toContain("COMMENT");
  });

  it("retries an empty job list before naming a hosted failure", () => {
    // #1699: the job list was empty just after the run completed, so an
    // order-email 401 was filed as "workflow startup".
    const raced = runFailedRun({ FAILED_JOBS: "order-email", JOBS_READY_ON: "3" });
    expect(raced.status).toBe(0);
    expect(raced.stdout).toContain("CREATE issue create --title Hosted job failing: order-email");
    const empty = runFailedRun({});
    expect(empty.status).toBe(0);
    expect(empty.stdout).toContain("CREATE issue create --title Hosted job failing: hosted jobs");
    expect(empty.stdout).not.toContain("workflow startup");
  });

  it("labels only a startup_failure run as workflow startup", () => {
    const result = runFailedRun({ CONCLUSION: "startup_failure" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CREATE issue create --title Hosted job failing: workflow startup");
  });

  it("re-audits the guides and the API reference weekly, skipping an unchanged main", () => {
    for (const file of ["documentation-agent", "http-api-agent"]) {
      const text = read(`.github/workflows/${file}.yml`);
      const workflow = load(text) as Workflow;
      expect(workflow.on).toHaveProperty("schedule");
      expect(workflow.jobs.maintain.if).toContain("github.event_name == 'schedule'");
      expect(text).toContain(`gh run list --workflow ${file}.yml --event schedule --status success`);
      expect(text).toContain("if: steps.context.outputs.skip != 'true'");
    }
    // CI-only merges skip the API agent the way DOCS: none skips the guide agent.
    const api = load(read(".github/workflows/http-api-agent.yml")) as Workflow;
    expect(api.jobs.maintain.if).toContain("!contains(github.event.pull_request.body, 'API: none')");
  });
});

describe("pull request template", () => {
  const template = read(".github/pull_request_template.md");

  it("prompts for the lines dreaming and the doc agents read", () => {
    expect(template).toContain("## Durable decisions (for the dreaming log)");
    for (const prompt of ["`TO` + `DO: <exact TODO.md item text>`", "`DOCS` + `: none`", "`API` + `: none`"]) expect(template).toContain(prompt);
  });

  it("prompts for a closing keyword so a finished issue closes on merge", () => {
    // Seven register PRs merged with their issues left open (#942–#975).
    expect(template).toMatch(/^Closes #$/m);
  });

  it("never carries a live directive, which would fire on every PR left unedited", () => {
    // pr-directives matches ^TODO: lines; the workflows match the substrings below.
    expect(template).not.toMatch(/^TODO:/m);
    expect(template).not.toContain("DOCS: none");
    expect(template).not.toContain("API: none");
  });
});

// tests/job-scheduler-workflow.test.ts — the hosted job routes have a scheduler.
// Vercel Hobby cron runs at most daily, so GitHub Actions POSTs the existing
// bearer-authenticated routes: order email every 5 minutes, retention daily.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse as load } from "yaml";

type Step = { run?: string; env?: Record<string, string> };
type Job = { if?: string; steps: Step[] };
type Workflow = { on: { schedule: { cron: string }[]; workflow_dispatch?: unknown }; permissions: unknown; jobs: Record<string, Job> };

const workflow = load(readFileSync(".github/workflows/hosted-jobs.yml", "utf8")) as Workflow;

describe("hosted jobs workflow", () => {
  it("runs order email every 5 minutes and retention daily, and can be run by hand", () => {
    expect(workflow.on.schedule.map((s) => s.cron)).toEqual(["*/5 * * * *", "17 7 * * *"]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.jobs["order-email"].if).toContain("'*/5 * * * *'");
    expect(workflow.jobs.retention.if).toContain("'17 7 * * *'");
  });

  it("POSTs each route with its own secret and fails the run on a non-2xx", () => {
    for (const [job, path, secret] of [
      ["order-email", "/api/email/jobs/deliver", "ORDER_EMAIL_JOB_SECRET"],
      ["retention", "/api/retention/jobs/prune", "RETENTION_JOB_SECRET"],
    ] as const) {
      const step = workflow.jobs[job].steps[0];
      expect(step.run).toContain(`-X POST "$MGR_URL${path}"`);
      expect(step.run).toContain("--fail-with-body");
      // --fail passes a 302, which is what Vercel Deployment Protection returns.
      expect(step.run).toContain("--location --max-redirs 0");
      expect(step.env?.SECRET).toBe(`\${{ secrets.${secret} }}`);
    }
    // Calling a public URL needs no repository access.
    expect(workflow.permissions).toEqual({});
  });

  it("fails every selected job before curl when MGR_URL is absent", () => {
    for (const job of Object.values(workflow.jobs)) {
      const result = spawnSync("bash", ["-e", "-c", job.steps[0].run!], { env: { ...process.env, MGR_URL: "" }, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("MGR_URL repository variable is required");
    }
  });
});

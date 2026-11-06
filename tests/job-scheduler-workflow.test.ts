// tests/job-scheduler-workflow.test.ts — the hosted job routes have a scheduler.
// Vercel Hobby cron runs at most daily, so GitHub Actions POSTs the existing
// bearer-authenticated routes: order email every 5 minutes, retention daily.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse as load } from "yaml";

type Step = { run?: string; env?: Record<string, string> };
type Job = { if?: string; permissions?: unknown; steps: Step[] };
type Workflow = { on: { schedule: { cron: string }[]; workflow_dispatch?: unknown }; permissions: unknown; jobs: Record<string, Job> };

const workflow = load(readFileSync(".github/workflows/hosted-jobs.yml", "utf8")) as Workflow;

describe("hosted jobs workflow", () => {
  it("runs order email every 5 minutes, retention daily and agent friction weekly, and can be run by hand", () => {
    expect(workflow.on.schedule.map((s) => s.cron)).toEqual(["*/5 * * * *", "17 7 * * *", "41 8 * * 1"]);
    expect(workflow.jobs["agent-friction"].if).toContain("'41 8 * * 1'");
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.jobs["order-email"].if).toContain("'*/5 * * * *'");
    expect(workflow.jobs.retention.if).toContain("'17 7 * * *'");
  });

  it("POSTs each route with its own secret and fails the run on a non-2xx", () => {
    for (const [job, path, secret] of [
      ["order-email", "/api/email/jobs/deliver", "ORDER_EMAIL_JOB_SECRET"],
      ["retention", "/api/retention/jobs/prune", "RETENTION_JOB_SECRET"],
      ["agent-friction", "/api/agents/jobs/friction", "AGENT_FRICTION_JOB_SECRET"],
    ] as const) {
      const step = workflow.jobs[job].steps[0];
      expect(step.run).toContain(`-X POST "$MGR_URL${path}"`);
      expect(step.run).toContain("--fail-with-body");
      // --fail passes a 302, which is what Vercel Deployment Protection returns.
      expect(step.run).toContain("--location --max-redirs 0");
      expect(step.env?.SECRET).toBe(`\${{ secrets.${secret} }}`);
    }
    // Calling a public URL needs no repository access. Only the report writes, and only issues.
    expect(workflow.permissions).toEqual({});
    expect(workflow.jobs["agent-friction"].permissions).toEqual({ issues: "write" });
    // Anyone can open an issue on a public repo, so the job rewrites only one it filed.
    expect(workflow.jobs["agent-friction"].steps[0].run).toContain("--author app/github-actions");
  });

  it("skips the friction report until its secret is set, so hosted jobs stays green", () => {
    const result = spawnSync("bash", ["-e", "-c", workflow.jobs["agent-friction"].steps[0].run!], { env: { ...process.env, MGR_URL: "https://mgr.test", SECRET: "" }, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("AGENT_FRICTION_JOB_SECRET is not set");
  });

  it("fails every selected job before curl when MGR_URL is absent", () => {
    for (const job of Object.values(workflow.jobs)) {
      const result = spawnSync("bash", ["-e", "-c", job.steps[0].run!], { env: { ...process.env, MGR_URL: "" }, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("MGR_URL repository variable is required");
    }
  });
});

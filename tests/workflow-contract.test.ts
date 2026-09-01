// tests/workflow-contract.test.ts — preserves the production-readiness workflow fixes merged in PRs #21 and #22.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readWorkflow(name: string) {
  return readFileSync(resolve(__dirname, "..", ".github", "workflows", name), "utf8");
}

const ci = readWorkflow("ci.yml");
const review = readWorkflow("claude-code-review.yml");
const dreaming = readWorkflow("dreaming.yml");

describe("production-readiness workflow contract", () => {
  it("runs invitation tests without excluding their test file", () => {
    expect(ci).toMatch(/- run: npx vitest run\b/);
    expect(ci).not.toMatch(/(?:--exclude|exclude:)[^\n]*tests\/commands-invites\.test\.ts/);
  });

  it("permits the review plugin to invoke Skill", () => {
    expect(review).toMatch(/--allowedTools "Skill(?:,|")/);
  });

  it("does not enable verbose review output", () => {
    expect(review).not.toContain("show_full_output");
  });

  it("treats GitHub Actions as trusted workflow context for dreaming", () => {
    expect(dreaming).toContain(
      "You are running inside GitHub Actions (GITHUB_ACTIONS=true); the CI-only guard is satisfied"
    );
  });
});

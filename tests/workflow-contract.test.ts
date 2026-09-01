// tests/workflow-contract.test.ts — preserves the production-readiness workflow fixes merged in PRs #21 and #22.
import { readFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { configDefaults } from "vitest/config";
import { describe, expect, it } from "vitest";
import vitestConfig from "../vitest.config";

const INVITE_TEST = "tests/commands-invites.test.ts";

function readWorkflow(name: string) {
  return readFileSync(resolve(__dirname, "..", ".github", "workflows", name), "utf8");
}

function readActionField(workflow: string, action: string, field: string) {
  const actionPattern = new RegExp(
    `^( {8})uses: ${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+#.*)?\\s*$`,
    "m"
  );
  const step = workflow
    .split(/(?=^ {6}- (?:name|uses):)/m)
    .find((candidate) => actionPattern.test(candidate));

  if (!step) {
    throw new Error(`Could not find the active ${action} workflow step`);
  }

  const actionMatch = step.match(actionPattern);
  const actionIndent = actionMatch?.[1].length;

  if (actionIndent === undefined) {
    throw new Error(`Could not find the active ${action} workflow step`);
  }

  const lines = step.split(/\r?\n/);
  const withIndex = lines.findIndex((line) =>
    new RegExp(`^ {${actionIndent}}with:(?:\\s+#.*)?\\s*$`).test(line)
  );

  if (withIndex === -1) {
    throw new Error(`Could not find active ${field} for ${action}`);
  }
  const fieldPattern = new RegExp(
    `^ {${actionIndent + 2}}${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(["'])([^\\n]*?)\\1(?:\\s+#.*)?\\s*$`
  );

  for (const line of lines.slice(withIndex + 1)) {
    const indent = line.match(/^ */)?.[0].length ?? 0;

    if (line.trim() && indent <= actionIndent) {
      break;
    }

    const match = line.match(fieldPattern);

    if (match) {
      return match[2];
    }
  }

  throw new Error(`Could not find active ${field} for ${action}`);
}

const ci = readWorkflow("ci.yml");
const review = readWorkflow("claude-code-review.yml");
const dreaming = readWorkflow("dreaming.yml");

describe("workflow action field reader", () => {
  it("requires a direct scalar child of the action's with mapping", () => {
    const fieldNestedUnderEnv = `
jobs:
  test:
    steps:
      - name: Run Claude
        uses: anthropics/claude-code-action@v1
        with:
          prompt: 'real prompt'
        env:
          claude_args: 'nested value'
`;
    const fieldInComment = `
jobs:
  test:
    steps:
      - name: Run Claude
        uses: anthropics/claude-code-action@v1
        with:
          # claude_args: 'commented value'
          prompt: 'real prompt'
`;

    expect(() =>
      readActionField(
        fieldNestedUnderEnv,
        "anthropics/claude-code-action@v1",
        "claude_args"
      )
    ).toThrow("Could not find active claude_args");
    expect(() =>
      readActionField(
        fieldInComment,
        "anthropics/claude-code-action@v1",
        "claude_args"
      )
    ).toThrow("Could not find active claude_args");
  });
});

describe("production-readiness workflow contract", () => {
  it("runs the full Vitest suite and includes invitation tests", () => {
    const testConfig = vitestConfig.test ?? {};
    const includes = testConfig.include ?? configDefaults.include;
    const excludes = [...configDefaults.exclude, ...(testConfig.exclude ?? [])];

    expect(ci).toMatch(/^ {6}- run: npx vitest run(?:\s+#.*)?\s*$/m);
    expect(includes.some((pattern) => matchesGlob(INVITE_TEST, pattern))).toBe(true);
    expect(excludes.some((pattern) => matchesGlob(INVITE_TEST, pattern))).toBe(false);
  });

  it("permits the review plugin to invoke Skill", () => {
    const claudeArgs = readActionField(
      review,
      "anthropics/claude-code-action@v1",
      "claude_args"
    );

    expect(claudeArgs).toContain('--allowedTools "Skill,');
  });

  it("does not enable verbose review output", () => {
    const claudeArgs = readActionField(
      review,
      "anthropics/claude-code-action@v1",
      "claude_args"
    );

    expect(claudeArgs).not.toContain("show_full_output");
  });

  it("treats GitHub Actions as trusted workflow context for dreaming", () => {
    const prompt = readActionField(
      dreaming,
      "anthropics/claude-code-action@v1",
      "prompt"
    );

    expect(prompt).toContain(
      "You are running inside GitHub Actions (GITHUB_ACTIONS=true); the CI-only guard is satisfied"
    );
  });
});

// tests/workflow-contract.test.ts — preserves the production-readiness workflow fixes merged in PRs #21 and #22.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { configDefaults } from "vitest/config";
import { describe, expect, it } from "vitest";

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
const supabaseEnvMapper = readFileSync(resolve(__dirname, "..", "scripts", "supabase-env.mjs"), "utf8");
const vitestConfig = readFileSync(resolve(__dirname, "..", "vitest.config.mts"), "utf8");

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
    expect(ci).toMatch(/^ {6}- run: npx vitest run(?:\s+#.*)?\s*$/m);
    expect(vitestConfig).toMatch(/include:\s*\[\s*"tests\/\*\*\/\*\.test\.ts"/);
    expect(matchesGlob(INVITE_TEST, "tests/**/*.test.ts")).toBe(true);
    expect(configDefaults.exclude.some((pattern) => matchesGlob(INVITE_TEST, pattern))).toBe(false);
  });

  it("maps Supabase CLI keys into the modern application environment contract", () => {
    expect(ci).toContain("node scripts/supabase-env.mjs");
    expect(supabaseEnvMapper).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(supabaseEnvMapper).toContain("SUPABASE_SECRET_KEY");
    expect(ci).toContain("COMMAND_RATE_LIMIT_HMAC_SECRET");
    expect(supabaseEnvMapper).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(supabaseEnvMapper).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("maps Supabase CLI stdin to only the modern application keys", () => {
    const cliStatus = [
      'API_URL="http://127.0.0.1:54321"',
      'ANON_KEY="test-anon-key"',
      'SERVICE_ROLE_KEY="test-service-role-key"',
    ].join("\n");
    const expectedOutput = [
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-anon-key",
      "SUPABASE_SECRET_KEY=test-service-role-key",
      "",
    ].join("\n");
    const result = spawnSync(process.execPath, ["scripts/supabase-env.mjs"], {
      cwd: resolve(__dirname, ".."),
      encoding: "utf8",
      input: cliStatus,
    });

    expect({
      exitedSuccessfully: result.status === 0,
      emittedOnlyModernMappings: result.stdout === expectedOutput,
      wroteNoDiagnostics: result.stderr === "",
    }).toEqual({
      exitedSuccessfully: true,
      emittedOnlyModernMappings: true,
      wroteNoDiagnostics: true,
    });
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

  it("opens dream PRs as the MGR GitHub App, not github.token or claude[bot]", () => {
    expect(dreaming).toMatch(
      /^ {8}uses: actions\/create-github-app-token@v2(?:\s+#.*)?\s*$/m
    );
    expect(dreaming).toContain("app-id: ${{ vars.MGR_APP_ID }}");
    expect(dreaming).toContain(
      "private-key: ${{ secrets.MGR_APP_PRIVATE_KEY }}"
    );
    expect(dreaming).toContain("permission-contents: write");
    expect(dreaming).toContain("permission-pull-requests: write");
    expect(dreaming).toContain("permission-issues: read");

    const githubToken = readActionField(
      dreaming,
      "anthropics/claude-code-action@v1",
      "github_token"
    );
    const botId = readActionField(
      dreaming,
      "anthropics/claude-code-action@v1",
      "bot_id"
    );
    const botName = readActionField(
      dreaming,
      "anthropics/claude-code-action@v1",
      "bot_name"
    );

    expect({ githubToken, botId, botName }).toEqual({
      githubToken: "${{ steps.mgr-app.outputs.token }}",
      botId: "${{ steps.mgr-bot.outputs.id }}",
      botName: "${{ steps.mgr-bot.outputs.login }}",
    });
    expect(dreaming).toContain('git config user.name "$login"');
    expect(dreaming).toContain(
      'git config user.email "${id}+${login}@users.noreply.github.com"'
    );
    expect(dreaming).not.toContain("dreaming-bot");
    expect(dreaming).toContain(
      "token: ${{ steps.mgr-app.outputs.token }}"
    );
  });

  it("ships a square MGR GitHub App icon rasterized from the app mark", () => {
    const icon = resolve(__dirname, "..", "docs/brand/mgr-github-app-icon.png");
    const png = readFileSync(icon);

    expect({
      isPng: png.subarray(1, 4).toString("ascii") === "PNG",
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
    }).toEqual({ isPng: true, width: 1024, height: 1024 });
  });
});

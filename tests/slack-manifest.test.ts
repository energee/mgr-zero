// tests/slack-manifest.test.ts — the importable Slack manifest stays exact and only targets a public HTTPS origin.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const run = (appUrl: string) => spawnSync("bunx", ["tsx", "scripts/render-slack-manifest.ts"], {
  cwd: process.cwd(), env: { ...process.env, APP_URL: appUrl }, encoding: "utf8",
});

describe("Slack app manifest", () => {
  it("renders the reviewed callbacks and only the three approved bot scopes", () => {
    expect(run("https://preview.mgrbrew.com/")).toMatchObject({ status: 0, stdout: ".local/slack-app-manifest.yml\n", stderr: "" });
    const manifest = readFileSync(".local/slack-app-manifest.yml", "utf8");
    expect(manifest).toContain("https://preview.mgrbrew.com/api/chat/slack/oauth");
    expect(manifest.match(/https:\/\/preview\.mgrbrew\.com\/api\/webhooks\/slack/g)).toHaveLength(2);
    const botScopes = manifest.match(/    bot:\n((?:      - .+\n)+)/)?.[1];
    expect(botScopes?.match(/^      - ([\w:]+)$/gm)?.map((line) => line.slice(8))).toEqual(["chat:write", "im:write", "groups:read"]);
  });

  it.each([
    "not a URL", "http://mgr.example", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://example.com",
    "https://mgr.example/path", "https://mgr.example?x=1", "https://user:pass@mgr.example",
  ])("rejects a non-public or non-origin APP_URL: %s", (appUrl) => {
    const result = run(appUrl);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("APP_URL must be a public https origin");
  });
});

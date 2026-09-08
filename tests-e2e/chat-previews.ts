// tests-e2e/chat-previews.ts — isolated local browser smoke for Chat settings previews and Slack venue frames.
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "vite";
import { CHAT_PREVIEW_FIXTURES } from "../lib/chat/preview-fixtures";

Object.assign(process.env, loadEnv("test", process.cwd(), ""));
assert.equal(process.env.MGR_TEST_STACK, "1", "Run scripts/test-db.sh first; chat smoke only uses the isolated test stack");

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;
const SESSION = "chat-settings";
const SHOTS = join(process.cwd(), ".local");
mkdirSync(SHOTS, { recursive: true });
type AbResult = { success: boolean; data: unknown; error: string | null };

function ab(...args: string[]) {
  const output = execFileSync("bunx", ["agent-browser", "--session", SESSION, ...args, "--json"], {
    encoding: "utf8", timeout: 35000, stdio: ["ignore", "pipe", "pipe"],
  });
  const result = JSON.parse(output) as AbResult;
  assert(result.success, result.error ?? `agent-browser ${args.join(" ")} failed`);
  return result.data as { result?: unknown; text?: string };
}

async function seedAdmin() {
  const { makeBrewery, makeStaff } = await import("../tests/helpers");
  const brewery = await makeBrewery("Chat browser smoke");
  return makeStaff(brewery.id, "admin");
}

async function serverUp() {
  try { return (await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(2000) })).status < 500; } catch { return false; }
}

async function waitForServer() {
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (await serverUp()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`next dev did not become ready at ${BASE_URL}`);
}

function startServer() {
  return spawn("bun", ["run", "dev", "--", "-p", String(PORT)], {
    detached: true, env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
}

function stopServer(server: ChildProcess | null) {
  if (!server?.pid) return;
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
}

function assertNoOverflow() {
  assert.equal(ab("eval", "document.documentElement.scrollWidth === document.documentElement.clientWidth").result, true, "page has horizontal overflow");
}

function assertNoSlackRequests() {
  const requests = JSON.stringify(ab("network", "requests"));
  assert(!requests.toLowerCase().includes("slack.com"), `unexpected Slack request: ${requests}`);
}

async function main() {
  let server: ChildProcess | null = null;
  try {
    assert(!(await serverUp()), `${BASE_URL} is already in use; chat smoke must own its Next process`);
    const admin = await seedAdmin();
    server = startServer();
    await waitForServer();

    ab("open", `${BASE_URL}/login`);
    ab("set", "viewport", "375", "900");
    ab("find", "label", "Email", "fill", admin.email);
    ab("find", "label", "Password", "fill", "test-password-1");
    ab("find", "role", "button", "click", "--name", "Sign in");
    ab("wait", "--url", "**/");
    ab("open", `${BASE_URL}/settings/chat`);
    ab("wait", "--text", "Fixture data only. Previews never send Slack messages.");
    ab("network", "requests", "--clear");

    const first = CHAT_PREVIEW_FIXTURES[0];
    ab("focus", `input[value=${JSON.stringify(first.id)}]`);
    ab("press", "Space");
    for (let index = 0; index < CHAT_PREVIEW_FIXTURES.length; index++) {
      const fixture = CHAT_PREVIEW_FIXTURES[index];
      assert.equal(ab("eval", `document.querySelector('input[value=${JSON.stringify(fixture.id)}]')?.checked`).result, true, `${fixture.title} was not selected by keyboard`);
      assert.equal(ab("eval", `document.activeElement?.matches(':focus-visible')`).result, true, `${fixture.title} lost visible keyboard focus`);
      assert.equal(ab("eval", `document.querySelector('section[aria-labelledby="chat-preview-${fixture.id}"] h3')?.textContent`).result, fixture.title);
      if (index < CHAT_PREVIEW_FIXTURES.length - 1) ab("press", "ArrowRight");
    }

    assert.equal(ab("eval", "document.querySelector('[role=dialog]') === null").result, true, "preview gallery unexpectedly opened a real modal");
    ab("focus", 'input[value="fermentation-gated"]'); ab("press", "Space");
    assert.equal(ab("eval", "document.querySelector('button[aria-disabled=true]')?.textContent").result, "Record reading");
    assert((ab("get", "text", "body").text ?? "").includes("Open this reading in MGR for now"));
    ab("focus", 'input[value="order-confirm-gated"]'); ab("press", "Space");
    assert.equal(ab("eval", "document.querySelector('button[aria-disabled=true]')?.textContent").result, "Confirm order");
    assert((ab("get", "text", "body").text ?? "").includes("This order needs the full MGR review"));
    assertNoOverflow();
    ab("screenshot", join(SHOTS, "chat-settings-phone.png"), "--full");

    ab("set", "viewport", "1440", "1000");
    assertNoOverflow();
    ab("screenshot", join(SHOTS, "chat-settings-desktop.png"), "--full");
    assertNoSlackRequests();

    ab("open", `${BASE_URL}/docs/integrations`);
    ab("wait", "--text", "Link identity");
    const body = ab("get", "text", "body").text ?? "";
    for (const name of ["Link identity", "Personal queue", "Personal DM", "Team digest", "Notification preferences", "Fermentation reading form", "Order confirmation form"]) assert(body.includes(name), `missing Slack venue ${name}`);
    assertNoOverflow();
    ab("screenshot", join(SHOTS, "slack-venues-desktop.png"), "--full");
    assertNoSlackRequests();
    console.log("Chat browser smoke passed: 10 keyboard previews, gated forms, 375/1440 screenshots, Slack venues, focus, no overflow, no Slack requests.");
  } finally {
    try { ab("close"); } catch { /* best-effort browser cleanup */ }
    stopServer(server);
  }
}

void main();

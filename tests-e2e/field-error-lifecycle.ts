// Run against this worktree's server: bun tests-e2e/field-error-lifecycle.ts http://localhost:3246
// Uses the existing local staff login; submits only invalid settings, never a write.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.argv[2];
assert(base, "Pass this worktree's running URL");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local browser regression only");
const session = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim().replaceAll("/", "-");
function ab(...args: string[]) {
  const response = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(response.success, response.error);
  return response.data;
}
const nextFrame = `() => { const { promise, resolve } = Promise.withResolvers(); requestAnimationFrame(resolve); return promise; }`;

try {
  ab("open", `${base}/settings`);
  if (ab("get", "url").url.includes("/login")) {
    ab("find", "label", "Email", "fill", process.env.MGR_E2E_STAFF_EMAIL ?? "dev@mgr.local");
    ab("find", "label", "Password", "fill", process.env.MGR_E2E_STAFF_PASSWORD ?? "dev-password-1");
    ab("find", "role", "button", "click", "--name", "Sign in");
    ab("wait", "--fn", "location.pathname !== '/login'");
    ab("open", `${base}/settings`);
  }
  ab("wait", "--text", "Brewery details");

  // Observe real recovery storage reads while its mounted consumer handles an event
  // and rerenders. An unstable public setter repeatedly runs the consumer's effect.
  const lifecycle = ab("eval", `(async () => {
    const frame = ${nextFrame};
    const prototype = Object.getPrototypeOf(sessionStorage);
    const original = prototype.getItem;
    let reads = 0;
    prototype.getItem = function(key) {
      if (this === sessionStorage && key.startsWith('mgr-command-recovery-v1:')) reads++;
      return original.call(this, key);
    };
    try {
      window.dispatchEvent(new Event('mgr-command-recovery-changed'));
      await frame();
      const afterEvent = reads;
      await frame();
      await frame();
      return { afterEvent, settled: reads };
    } finally { prototype.getItem = original; }
  })()`).result;
  assert(lifecycle.afterEvent > 0, "Mounted CommandRecovery must handle the recovery event");
  assert.equal(lifecycle.settled, lifecycle.afterEvent, "Recovery rerender must not repeat its setter-dependent effect");

  for (const value of ["1.234", "-1", "1e2", "21474836.48"]) {
    ab("find", "label", "One-way keg fee ($)", "fill", value);
    const result = ab("eval", `(async () => {
      const frame = ${nextFrame};
      const input = document.querySelector('input[aria-label="One-way keg fee ($)"]');
      const form = input.closest('form');
      const original = window.fetch;
      let commands = 0;
      window.fetch = function(resource, options) {
        const url = resource instanceof Request ? resource.url : String(resource);
        if (new URL(url, location.origin).pathname === '/api/command') commands++;
        return original.call(this, resource, options);
      };
      try {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await frame();
        await frame();
        const errorId = input.getAttribute('aria-describedby')?.split(' ').find(id => id.endsWith('-error'));
        return { commands, invalid: input.getAttribute('aria-invalid'), error: errorId && document.getElementById(errorId)?.textContent, disabled: form.querySelector('button[type="submit"]').disabled };
      } finally { window.fetch = original; }
    })()`).result;
    assert.equal(result.commands, 0, `Invalid fee ${value} must not begin any settings command`);
    assert.equal(result.invalid, "true", `Invalid fee ${value} must be highlighted`);
    assert(result.error, `Invalid fee ${value} needs field-local feedback`);
    assert(result.disabled, `Invalid fee ${value} must disable Save brewery`);
  }
  console.log("Mounted recovery rerender and invalid settings submission regression passed.");
} finally {
  ab("close");
}

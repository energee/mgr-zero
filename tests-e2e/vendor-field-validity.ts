// Run against the integrated #1296/#1297 server after logging into this branch's browser session:
// bun tests-e2e/vendor-field-validity.ts http://localhost:3246
// --native-only exercises min/step checks on #1296 alone. No vendor is created:
// the final request deliberately contains a schema-invalid phone.
// --custom-validity-fixture uses the real input's native custom validity to prove
// #1296's guard independently; it does not claim #1297's lexical rule is installed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.argv[2];
assert(base, "Pass this worktree's running URL");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local regression only");
const session = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim().replaceAll("/", "-");
const customValidityFixture = process.argv.includes("--custom-validity-fixture");
function ab(...args: string[]) {
  const response = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(response.success, response.error);
  return response.data;
}

try {
  ab("open", `${base}/vendors`);
  ab("find", "role", "button", "click", "--name", "Add vendor");
  ab("find", "label", "Vendor name", "fill", "Validation submission regression");
  const values = process.argv.includes("--native-only") ? ["-1", "1.5"] : ["-1", "1.5", "1e3", "1E3"];
  for (const value of values) {
    ab("find", "label", "Lead time (days)", "fill", value);
    if (customValidityFixture) {
      ab("eval", `document.querySelector('input[aria-label="Lead time (days)"]').setCustomValidity(${JSON.stringify(/[eE]/.test(value) ? "Use decimal notation." : "")})`);
    }
    const validity = ab("eval", `(() => {
      const input = document.querySelector('input[aria-label="Lead time (days)"]');
      return { invalid: !input.validity.valid, customError: input.validity.customError };
    })()`).result;
    // Missing #1297 is an explicit prerequisite failure, not permission to send
    // an exponent that the unintegrated primitive would accept and convert.
    if (/[eE]/.test(value)) assert(validity.customError, "Integrate #1297 lexical custom validity before running exponent cases");
    assert(validity.invalid, `${value} must be invalid before submission`);
    const commands = ab("eval", `(async () => {
      const form = document.querySelector('input[aria-label="Lead time (days)"]').closest('form');
      const original = window.fetch;
      let commands = 0;
      window.fetch = function(resource, options) {
        const url = resource instanceof Request ? resource.url : String(resource);
        if (new URL(url, location.origin).pathname === '/api/command') commands++;
        return original.call(this, resource, options);
      };
      try {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        const { promise, resolve } = Promise.withResolvers();
        requestAnimationFrame(resolve);
        await promise;
        return commands;
      } finally { window.fetch = original; }
    })()`).result;
    assert.equal(commands, 0, `Invalid lead time ${value} must not reach command input conversion`);
  }
  ab("find", "label", "Lead time (days)", "fill", "5");
  if (customValidityFixture) ab("eval", `document.querySelector('input[aria-label="Lead time (days)"]').setCustomValidity('')`);
  assert.equal(ab("eval", `document.querySelector('input[aria-label="Lead time (days)"]').validity.valid`).result, true, "Normal correction must clear native/custom invalidity");
  ab("find", "label", "Phone", "fill", "abc");
  ab("find", "role", "button", "click", "--name", "Save vendor");
  ab("wait", "--fn", `document.querySelector('input[aria-label="Phone"]')?.getAttribute('aria-invalid') === 'true'`);
  assert.equal(ab("eval", `document.querySelector('input[aria-label="Lead time (days)"]').value`).result, "5", "Structured server phone rejection must preserve corrected lead time");
  assert.equal(ab("eval", `document.querySelector('input[aria-label="Phone"]').value`).result, "abc", "Rejected vendor must remain open for correction");
  console.log(`Vendor DOM validity and structured server-error regression passed${customValidityFixture ? " (declared native custom-validity fixture)" : ""}.`);
} finally {
  ab("close");
}

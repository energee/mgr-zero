// Fixture-only browser checks against this worktree's running server; no database writes.
// Run: bun tests-e2e/accessibility-followups.ts http://localhost:<printed-port>
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
function chooseScreen(name: string) {
  ab("eval", `Array.from(document.querySelectorAll('[aria-label="Screens"] button')).find(x => x.textContent === ${JSON.stringify(name)}).click()`);
}
function wait(expression: string) {
  ab("wait", "--fn", `Boolean(${expression})`);
}

try {
  ab("open", `${base}/docs/screens-explore`);
  ab("set", "viewport", "1440", "1000");
  wait("document.querySelector('[aria-label=Screens] button')");
  chooseScreen("Settings");
  wait("document.querySelector('#portal-warehouse')");
  const snapshot = ab("snapshot").snapshot;
  assert.match(snapshot, /combobox "Portal fulfillment warehouse"/);
  assert.match(snapshot, /Warehouse/);
  assert.equal(ab("eval", "document.querySelector('#portal-warehouse').textContent.trim()").result, "Warehouse");
  const requiredMarker = ab("eval", `getComputedStyle(document.querySelector('#portal-warehouse').closest('[data-slot=field]').querySelector('[data-slot=field-label]'), '::after').content`).result;
  assert.match(requiredMarker, /required/, "Required picker must have a visible label marker");
  const frame = ab("eval", `document.querySelector('a[target="_blank"][href^="/screens/frame/"]').href`).result;
  ab("open", frame);
  ab("set", "viewport", "320", "256");
  wait("document.querySelector('#portal-warehouse')");
  assert(ab("eval", "document.documentElement.scrollWidth <= document.documentElement.clientWidth").result, "Settings must reflow at the 320 CSS-pixel viewport used for 400% zoom");
  assert(ab("eval", "Array.from(document.querySelectorAll('[data-mgr-page-scroll]')).every(x => x.scrollWidth <= x.clientWidth)").result, "Settings page content must not require horizontal scrolling");
  ab("set", "viewport", "1440", "1000");
  console.log("Accessibility browser regression passed: select name and value, visible required marker, and 400% equivalent Settings reflow.");
} finally {
  ab("close");
}

// Against a running local app and authenticated Admin/Warehouse browser session:
// bun tests-e2e/movement-navigation.ts <branch-session> <base-url>
// Opens and dismisses forms only. The caller owns server/login/session cleanup.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [session, base] = process.argv.slice(2);
assert(session && base, "Provide a named browser session and local base URL");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local app only");
function ab(...args: string[]) {
  const response = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(response.success, response.error);
  return response.data;
}
const movementDialog = `Array.from(document.querySelectorAll('[role=dialog]')).find(dialog => dialog.querySelector('[data-slot=dialog-title],[data-slot=sheet-title]')?.textContent === 'Record movement')`;
function expectOpen() {
  ab("wait", "--fn", `new URLSearchParams(location.search).get('recordMovement') === '1' && !!(${movementDialog})`);
  assert.equal(ab("eval", `location.pathname`).result, "/inventory");
}
function close() {
  ab("press", "Escape");
  ab("wait", "--fn", `!new URLSearchParams(location.search).has('recordMovement') && !(${movementDialog})`);
}

// Exercise both the first entry and the repeated entry after a prior cleanup.
for (const entry of ["first", "repeat"]) {
  ab("open", `${base}/`);
  ab("wait", "--text", "Record movement");
  ab("press", "Control+k");
  ab("wait", "--fn", `document.querySelector('[data-mgr-composer] button[aria-label="Expand Ask MGR"]') !== null`);
  ab("press", "Escape");
  // No animation wait, timer, or retry between drawer close and the real mouse click.
  ab("find", "role", "link", "click", "--name", "Record movement", "--exact");
  expectOpen();
  close();
  assert.equal(ab("eval", "location.pathname + location.search").result, "/inventory");
  console.log(`${entry}: Ask MGR Escape → Today mouse link → movement dialog → close clears URL`);
}

// A direct deep link still opens and closing drops its prefill, not its page.
ab("open", `${base}/inventory?recordMovement=1&type=depletion&qty=-2&page=3`);
expectOpen();
ab("wait", "--fn", `document.querySelector('[data-state=on]')?.textContent === 'Depletion'`);
close();
assert.equal(ab("eval", "location.pathname + location.search").result, "/inventory?page=3");
ab("reload");
ab("wait", "--text", "Finished goods");
assert.equal(ab("eval", `!!(${movementDialog})`).result, false);

// The retained inventory instance follows URL state on trigger / Back / Forward.
ab("find", "role", "button", "click", "--name", "Record movement", "--exact");
expectOpen();
ab("back");
ab("wait", "--fn", `!new URLSearchParams(location.search).has('recordMovement') && !(${movementDialog})`);
ab("forward");
expectOpen();
if (ab("eval", `matchMedia('(max-width: 767px)').matches`).result) {
  ab("find", "role", "combobox", "click", "--name", "Kind", "--exact");
  ab("find", "role", "option", "click", "--name", "Loss", "--exact");
} else {
  ab("find", "role", "radio", "click", "--name", "Loss", "--exact");
}
ab("find", "label", "Note", "fill", "Unsaved navigation regression");
close();
ab("find", "role", "button", "click", "--name", "Record movement", "--exact");
expectOpen();
assert.equal(ab("eval", `!!document.querySelector('[data-state=on]')`).result, false, "Reopened movement has no stale kind");
assert.equal(ab("eval", `document.querySelector('input[aria-label=Note]')?.value`).result, "", "Reopened movement discards unsaved note");
close();
console.log("Deep-link prefill, pagination, reload, retained trigger, Back/Forward, and rapid edit/close/reopen passed");

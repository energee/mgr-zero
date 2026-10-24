// Against an authenticated named session and an owned, priced cell in a local app:
// bun tests-e2e/price-cell-feedback.ts <session> <pricing-url> <cell-accessible-label>
// Mutates only that cell, restoring its initial price before returning.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [session, pricingUrl, label] = process.argv.slice(2);
assert(session && pricingUrl && label, "Provide a named session, local pricing URL, and an owned cell label");
const url = new URL(pricingUrl);
assert(["localhost", "127.0.0.1"].includes(url.hostname), "Local app only");
assert.equal(url.pathname, "/pricing");
function ab(...args: string[]) {
  const result = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(result.success, result.error);
  return result.data;
}
const field = `input[aria-label=${JSON.stringify(label)}]`;
const form = `form:has(${field})`;
const inputExpression = `document.querySelector(${JSON.stringify(field)})`;
const cellExpression = `${inputExpression}?.closest('form')`;
function readValue() {
  return ab("get", "value", field).value as string;
}
function loadCell() {
  ab("open", pricingUrl);
  ab("wait", "--fn", `Boolean(${inputExpression} && !${inputExpression}.disabled)`);
}
function leaveThroughClear(text: string) {
  if (text === "") {
    // Use the real deletion keys: fill("") does not notify React in this CLI.
    ab("focus", field);
    ab("press", "End");
    ab("press", "Shift+Home");
    ab("press", "Backspace");
  } else {
    ab("fill", field, text);
  }
  ab("press", "Tab");
  assert.equal(ab("eval", `${cellExpression}.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON'`).result, true, "First Tab must reach this cell's Clear button");
  ab("press", "Tab");
}
function waitStatus(text: string) {
  ab("wait", "--fn", `${cellExpression}?.querySelector('[role=status]')?.textContent === ${JSON.stringify(text)}`);
}
function openClear() {
  ab("click", `${form} button[aria-label="Clear price"]`);
  ab("wait", "--fn", "Boolean(document.querySelector('[role=dialog][data-state=open]'))");
}
loadCell();
const original = readValue();
assert(original !== "", "Use an owned cell with a persisted price and a Clear button");
const changed = original === "8.25" ? "9.25" : "8.25";
try {
  leaveThroughClear(changed);
  waitStatus("Saved");
  loadCell();
  assert.equal(readValue(), changed, "Tab through Clear must persist the edited price");

  leaveThroughClear("");
  waitStatus("Price unchanged. Use Clear and confirm to remove it.");
  assert.equal(readValue(), changed, "Blank keyboard departure must restore the persisted price");
  assert.equal(ab("eval", `(() => { const feedback = ${cellExpression}.querySelector('[role=status]'); return feedback.scrollWidth <= feedback.clientWidth; })()`).result, true, "Restoration feedback must wrap inside its cell");
  loadCell();
  assert.equal(readValue(), changed);

  for (const invalid of ["-5", "abc", "1e3", "1.001"]) {
    leaveThroughClear(invalid);
    ab("wait", "--fn", `${inputExpression}?.getAttribute('aria-invalid') === 'true' && Boolean(${cellExpression}?.querySelector('[role=alert]'))`);
    assert.equal(readValue(), invalid, "Invalid draft must remain available to correct");
    assert.equal(ab("eval", `(() => { const feedback = ${cellExpression}.querySelector('[role=alert]'); return feedback.scrollWidth <= feedback.clientWidth; })()`).result, true, "Validation must wrap inside its cell");
    loadCell();
    assert.equal(readValue(), changed, "Invalid draft must not replace the saved price");
  }

  // Opening and cancelling Clear must not save the edit that was in the input.
  ab("fill", field, "11.25");
  openClear();
  ab("find", "role", "button", "click", "--name", "Cancel", "--exact");
  loadCell();
  assert.equal(readValue(), changed, "Clicking Clear must not first save the edited price");

  // Keyboard activation must also open the confirmation without saving a draft.
  ab("fill", field, "12.25");
  ab("press", "Tab");
  ab("press", "Enter");
  ab("wait", "--fn", "Boolean(document.querySelector('[role=dialog][data-state=open]'))");
  ab("find", "role", "button", "click", "--name", "Cancel", "--exact");
  loadCell();
  assert.equal(readValue(), changed, "Keyboard Clear activation must not save the edited price");

  openClear();
  ab("click", '[role="dialog"][data-state="open"] button[type="submit"]');
  ab("wait", "--fn", `!document.querySelector('[role=dialog][data-state=open]') && ${inputExpression}?.value === ''`);
  loadCell();
  assert.equal(readValue(), "", "Only confirming Clear removes the persisted price");
  ab("fill", field, "0");
  ab("press", "Enter");
  waitStatus("Saved");
  loadCell();
  assert.equal(readValue(), "0.00", "Zero remains a valid persisted price");
  console.log("Passed real Tab departure, blank restore, invalid retention, and pointer/keyboard Clear cancel/confirm with persisted readback.");
} finally {
  loadCell();
  if (readValue() !== original) {
    ab("fill", field, original);
    ab("press", "Enter");
    waitStatus("Saved");
    loadCell();
  }
  assert.equal(readValue(), original, "Restore the owned cell's original price");
}

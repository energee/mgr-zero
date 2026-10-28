// Against an authenticated named session and an owned, priced cell in a local app:
// bun tests-e2e/price-cell-feedback.ts <session> <pricing-url> <cell-accessible-label>
// Mutates only that cell, restoring its initial price before returning.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const [session, pricingUrl, label] = process.argv.slice(2);
assert(session && pricingUrl && label, "Provide a named session, local pricing URL, and an owned priced cell label");
const url = new URL(pricingUrl);
assert(["localhost", "127.0.0.1"].includes(url.hostname), "Local app only");
assert.equal(url.pathname, "/pricing");
function ab(...args: string[]) {
  const result = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(result.success, result.error);
  return result.data;
}
const field = `input[aria-label=${JSON.stringify(label)}]`;
const inputExpression = `document.querySelector(${JSON.stringify(field)})`;
const cellExpression = `${inputExpression}?.closest('form')`;
function readValue() {
  return ab("get", "value", field).value as string;
}
function loadCell() {
  ab("open", pricingUrl);
  ab("wait", "--fn", `Boolean(${inputExpression} && !${inputExpression}.disabled)`);
}
function leaveCell(text: string, departure: "Tab" | "click") {
  if (text === "") {
    // Use the real deletion keys: fill("") does not notify React in this CLI.
    ab("focus", field);
    ab("press", "End");
    ab("press", "Shift+Home");
    ab("press", "Backspace");
  } else {
    ab("fill", field, text);
  }
  if (departure === "Tab") ab("press", "Tab");
  else ab("find", "role", "heading", "click", "--name", "Price groups", "--exact");
}
function waitStatus(text: string) {
  ab("wait", "--fn", `${cellExpression}?.querySelector('[role=status]')?.textContent === ${JSON.stringify(text)}`);
}
loadCell();
const original = readValue();
assert(original !== "", "Use an owned cell with a persisted price");
let changed = original === "7.00" ? "8.00" : "7.00";
try {
  for (const departure of ["Tab", "click"] as const) {
    leaveCell(changed, departure);
    waitStatus("Saved");
    loadCell();
    assert.equal(readValue(), changed, `${departure} must persist the edited price`);

    leaveCell("", departure);
    waitStatus("Saved");
    loadCell();
    assert.equal(readValue(), "", `${departure} from an emptied cell must clear the persisted price`);
    leaveCell(changed, departure);
    waitStatus("Saved");
    loadCell();

    for (const invalid of ["-5", "abc", "1e3", "12.345"]) {
      leaveCell(invalid, departure);
      ab("wait", "--fn", `${inputExpression}?.getAttribute('aria-invalid') === 'true' && Boolean(${cellExpression}?.querySelector('[role=alert]'))`);
      assert.equal(readValue(), invalid, "Invalid draft must remain available to correct");
      assert.equal(ab("eval", `(() => { const feedback = ${cellExpression}.querySelector('[role=alert]'); return feedback.scrollWidth <= feedback.clientWidth; })()`).result, true, "Validation must wrap inside its cell");
      loadCell();
      assert.equal(readValue(), changed, "Invalid draft must not replace the saved price");
    }
    if (departure === "Tab") changed = "8.50";
  }

  ab("fill", field, "0");
  ab("press", "Enter");
  waitStatus("Saved");
  loadCell();
  assert.equal(readValue(), "0.00", "Zero remains a valid persisted price");
  console.log("Passed real Tab and click departure, clear by emptying, invalid retention, and zero with persisted readback.");
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

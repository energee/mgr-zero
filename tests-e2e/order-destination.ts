// Against a running local app and an already-authenticated, named browser session:
// bun tests-e2e/order-destination.ts <session> <base-url> <customer-label> <default-ship-to-label> [alternate-ship-to-label]
// Opens a form but never submits it; caller owns login and closes its session.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const [session, base, customer, expected, alternate] = process.argv.slice(2);
assert(session && base && customer && expected, "Provide named session, local base URL, customer and expected destination");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local app only");
function ab(...args: string[]) {
  const result = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 30000 }));
  assert(result.success, result.error);
  return result.data;
}
ab("open", `${base}/orders`);
ab("find", "role", "button", "click", "--name", "New Order", "--exact");
ab("find", "role", "combobox", "click", "--name", "Customer", "--exact");
ab("find", "role", "option", "click", "--name", customer, "--exact");
ab("snapshot", "-i");
const result = ab("eval", `(() => { const field = document.getElementById("order-ship-to"); return field instanceof HTMLSelectElement ? field.selectedOptions[0]?.textContent : field?.textContent; })()`);
assert.equal(result.result ?? result, expected, "Customer selection must retain its default ship-to after options register");
if (alternate) {
  ab("select", "#order-ship-to", alternate);
  ab("find", "label", "PO number", "fill", "destination check");
  const changed = ab("eval", 'document.getElementById("order-ship-to").selectedOptions[0]?.textContent');
  assert.equal(changed.result ?? changed, alternate, "An explicit destination must survive other form edits");
}
console.log("Default destination and explicit selection retained");

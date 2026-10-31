// Against this worktree's running local app; fixture-only, with no login or writes:
// bun tests-e2e/search-pick-accessibility.ts <named-session> <base-url>
// Caller owns starting the app and closing the browser session.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { SCREENS } from "../components/mgr/screens";
import { newOrderDraft } from "../lib/mgr/fixtures/orders";

const [session, base] = process.argv.slice(2);
assert(session && base, "Provide a named browser session and this worktree's local app URL");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local app only");

function browser(...args: string[]) {
  const response = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(response.success, response.error);
  return response.data;
}

const cases = [
  { screen: "New order", names: newOrderDraft.lines.map((line, index) => `Line ${index + 1} SKU ${line.name}`) },
  { screen: "New order unavailable SKU", names: newOrderDraft.lines.map((line, index) => `Line ${index + 1} SKU ${line.name}`) },
  { screen: "Ingredient", names: ["Material Citra · hop"] },
  { screen: "Keg event history", names: ["Customer All customers"] },
];

for (const width of [1024, 390]) {
  browser("set", "viewport", String(width), "844");
  for (const { screen, names } of cases) {
    const index = SCREENS.findIndex(record => record.name === screen);
    assert(index >= 0, `Missing inventory screen: ${screen}`);
    browser("open", `${base}/screens/frame/${index}`);
    for (const name of names) {
      // Role lookup uses Chromium's accessible name, not textContent or ARIA source inspection.
      browser("find", "role", "button", "text", "--name", name, "--exact");
    }
    console.log(JSON.stringify({ screen, width, names }));
  }
}

browser("set", "viewport", "1024", "844");
browser("open", `${base}/docs/screens-explore`);
browser("find", "label", "Find a screen", "fill", "Ingredient");
browser("find", "role", "button", "click", "--name", "Ingredient", "--exact");
browser("find", "role", "button", "text", "--name", "Material Citra · hop", "--exact");
const ingredientUrl = browser("get", "url").url;
browser("find", "role", "button", "click", "--name", "Material Citra · hop", "--exact");
assert.equal(browser("get", "url").url, ingredientUrl, "A material picker must not navigate away from the ingredient editor");
console.log("Explorer material picker retains its screen after accessible naming changes.");

// Run against this worktree's dev server: bun tests-e2e/palette-smoke.ts http://localhost:3002
// Fixture-only: no login or database writes. Covers cmdk and the explorer's tap bridge.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.argv[2];
assert(base, "Pass the URL printed by next dev");
const session = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim().replaceAll("/", "-");
function ab(...args: string[]) {
  const result = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(result.success, result.error);
  return result.data;
}
const wait = (expression: string) => ab("wait", "--fn", `Boolean(${expression})`);
const chooseScreen = (name: string) => ab("eval", `Array.from(document.querySelectorAll('[aria-label="Screens"] button')).find(x => x.textContent === ${JSON.stringify(name)}).click()`);
const heading = (name: string) => `Array.from(document.querySelectorAll('.screen-box h2')).some(x => x.textContent === ${JSON.stringify(name)})`;

try {
  ab("open", `${base}/docs/screens-explore`);
  ab("set", "viewport", "1440", "1000");
  wait("document.querySelector('[aria-label=Screens] button')");
  chooseScreen("Search");
  ab("fill", "[cmdk-input]", "zzzz-no-match");
  wait("document.querySelector('[cmdk-empty]')?.textContent.includes('No matches')");
  ab("press", "Enter");
  assert(ab("eval", heading("Search")).result, "Enter with no matches must stay in Search");
  ab("fill", "[cmdk-input]", "Hazy");
  wait("document.querySelectorAll('[cmdk-item]').length === 2");
  ab("press", "ArrowDown");
  wait("document.querySelector('[cmdk-item][aria-selected=true]')?.textContent.includes('ORD-0231')");
  ab("press", "ArrowUp");
  wait("document.querySelector('[cmdk-item][aria-selected=true]')?.textContent.includes('ATP 11')");
  ab("press", "ArrowDown");
  ab("press", "Enter");
  wait("!document.querySelector('[cmdk-input]')");
  assert(ab("eval", "document.querySelector('.screen-box h1')?.textContent").result.includes("ORD-"));

  chooseScreen("Record movement");
  ab("eval", "Array.from(document.querySelectorAll('.screen-box [data-slot=item]')).find(x => x.textContent.includes('SKU / package')).click()");
  ab("fill", "[cmdk-input]", "Pils");
  wait("document.querySelectorAll('[cmdk-item]').length === 1");
  ab("press", "Enter");
  wait(heading("Record movement"));
  ab("eval", "Array.from(document.querySelectorAll('.screen-box [data-slot=item]')).find(x => x.textContent.includes('SKU / package')).click()");
  ab("click", '[cmdk-item][aria-label="Stout · ⅙ bbl keg"]');
  wait(heading("Record movement"));
  console.log("Palette smoke passed: filtering, empty state, arrow keys, Enter, and click return.");
} finally {
  ab("close");
}

// Run against this worktree's dev server: bun tests-e2e/ask-mgr-navigation.ts http://localhost:3002
// Fixture-only: exercises real focus/dismissal behavior without login, AI requests, or database writes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { SCREENS } from "../components/mgr/screens";

const base = process.argv[2];
assert(base, "Pass the URL printed by next dev");
const index = SCREENS.findIndex(screen => screen.name === "Today");
assert(index >= 0, "Missing Today fixture");
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim().replaceAll("/", "-");
const session = `${branch}-chat-regression`;
function browser(...args: string[]) {
  const response = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(response.success, response.error);
  return response.data;
}
const evaluate = (expression: string) => browser("eval", expression).result;
const wait = (expression: string) => browser("wait", "--fn", `Boolean(${expression})`);
const panel = 'document.querySelector("[data-mgr-composer]")';
const prompt = 'textarea[aria-label="Ask MGR"]';

try {
  browser("set", "viewport", "1280", "800");
  browser("open", `${base}/screens/frame/${index}`);
  browser("wait", "--text", "Navigate");
  browser("find", "role", "radio", "click", "--name", "Ask MGR", "--exact");
  browser("fill", prompt, "Keep this draft while I use the page");
  const pageWidth = evaluate('document.querySelector("[data-mgr-page-scroll]").getBoundingClientRect().width');
  browser("find", "role", "radio", "click", "--name", "Navigate", "--exact");
  wait(`getComputedStyle(${panel}).display === "none"`);
  assert.equal(evaluate('document.querySelector("[data-mgr-page-scroll]").getBoundingClientRect().width'), pageWidth, "Chat must not resize the page");
  assert.equal(evaluate("document.activeElement.textContent"), "Navigate", "Closing chat returns focus to navigation");
  browser("find", "role", "radio", "click", "--name", "Ask MGR", "--exact");
  assert.equal(browser("get", "value", prompt).value, "Keep this draft while I use the page", "Closing chat must retain its unsent message");

  // Radix foreground modals and the Base UI chat panel receive the same Escape event.
  browser("find", "role", "button", "click", "--name", "Me", "--exact");
  wait('document.querySelector("[data-slot=dialog-content]")');
  browser("press", "Escape");
  wait('!document.querySelector("[data-slot=dialog-content]")');
  assert.notEqual(evaluate(`getComputedStyle(${panel}).display`), "none", "Escape must close only the foreground modal, not chat behind it");

  // A desktop user can focus the uncovered page before rotating to a modal phone layout.
  evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === "Search").focus()');
  assert.equal(evaluate(`${panel}.contains(document.activeElement)`), false);
  browser("set", "viewport", "390", "844");
  wait(`${panel}.contains(document.activeElement)`);
  assert.equal(evaluate("document.activeElement.tagName"), "DIV", "Entering phone chat should focus the panel, not summon the keyboard");
  assert.equal(browser("get", "value", prompt).value, "Keep this draft while I use the page", "Responsive mode changes must not remount the conversation");
  browser("press", "Tab");
  assert.equal(evaluate("document.activeElement.textContent"), "Back to page", "Phone chat must restore reachable tab stops after desktop focus leaves the panel");
  browser("press", "Shift+Tab");
  assert.equal(evaluate(`${panel}.contains(document.activeElement)`), true, "Phone chat must contain keyboard focus");
  assert.equal(evaluate("document.documentElement.scrollWidth > innerWidth"), false, "Phone chat must fit the viewport");
  browser("find", "role", "button", "click", "--name", "Back to page", "--exact");
  wait(`getComputedStyle(${panel}).display === "none"`);
  assert.equal(evaluate("document.activeElement.textContent"), "Navigate");

  // A foreground form keeps accessibility and focus ownership across a breakpoint change.
  browser("set", "viewport", "1280", "800");
  browser("find", "role", "radio", "click", "--name", "Ask MGR", "--exact");
  browser("find", "role", "button", "click", "--name", "Me", "--exact");
  wait('document.querySelector("[data-slot=dialog-content]")');
  browser("set", "viewport", "390", "844");
  assert.equal(evaluate('document.querySelector("[data-slot=dialog-content]").closest("[aria-hidden=true]") === null'), true, "Foreground Me must remain exposed to assistive technology");
  assert.equal(evaluate('document.querySelector("[data-slot=dialog-content]").contains(document.activeElement)'), true, "Foreground Me must retain focus");
  browser("press", "Escape");
  wait('!document.querySelector("[data-slot=dialog-content]")');
  wait(`${panel}.contains(document.activeElement)`);
  browser("press", "Tab");
  assert.equal(evaluate("document.activeElement.textContent"), "Back to page", "Closing the foreground form must restore usable phone chat");
  assert.equal(browser("get", "value", prompt).value, "Keep this draft while I use the page", "Foreground forms and responsive transitions must retain the draft");
  browser("find", "role", "button", "click", "--name", "Back to page", "--exact");
  wait(`getComputedStyle(${panel}).display === "none"`);

  // The explorer intercepts record-navigation labels during capture; chat controls must act locally.
  browser("set", "viewport", "1280", "900");
  browser("open", `${base}/docs/screens-explore`);
  wait('document.querySelector("[aria-label=Screens] button")');
  evaluate('Array.from(document.querySelectorAll("[aria-label=Screens] button")).find(button => button.textContent.trim() === "Composer answer").click()');
  wait('document.querySelector("[aria-label=Screens] [aria-selected=true]")?.textContent.trim() === "Composer answer"');
  browser("find", "role", "radio", "click", "--name", "Ask MGR", "--exact");
  browser("fill", prompt, "Keep this explorer draft");
  browser("set", "viewport", "1024", "800");
  assert.equal(evaluate(`(() => { const box = document.querySelector(".screen-box").getBoundingClientRect(); const chat = ${panel}.getBoundingClientRect(); return chat.left >= box.left && chat.right <= box.right; })()`), true, "Chat must fit the explorer's containing block, not only the outer viewport");
  browser("set", "viewport", "1280", "900");
  browser("find", "role", "button", "click", "--name", "Back to page", "--exact");
  assert.equal(evaluate('document.querySelector("[aria-label=Screens] [aria-selected=true]")?.textContent.trim()'), "Composer answer", "Closing chat must not navigate the explorer to another record");
  browser("find", "role", "radio", "click", "--name", "Ask MGR", "--exact");
  assert.equal(browser("get", "value", prompt).value, "Keep this explorer draft", "Closing chat must not remount the explorer frame");
  console.log("Ask MGR navigation smoke passed: draft retention, stable page width, foreground modal ownership, responsive tab navigation, mobile focus containment, return focus, and embedded panel containment.");
} finally {
  browser("close");
}

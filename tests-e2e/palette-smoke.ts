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

// Standalone frames exercise the shared controls without the explorer's tap routing.
function openFrame(name: string) {
  ab("open", `${base}/docs/screens-explore`);
  wait("document.querySelector('[aria-label=Screens] button')");
  chooseScreen(name);
  const href = ab("eval", `Array.from(document.querySelectorAll('a')).find(link => link.textContent === 'Frame alone').href`).result;
  ab("open", href);
}

function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
function contrast(a: number[], b: number[]) {
  const light = luminance(a);
  const dark = luminance(b);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}
function checkHighlight(selector: string) {
  wait(`document.querySelector(${JSON.stringify(selector)})`);
  const style = ab("eval", `(() => {
    const row = document.querySelector(${JSON.stringify(selector)});
    const active = getComputedStyle(row);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgb = color => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    return {
      width: parseFloat(active.outlineWidth), line: active.outlineStyle,
      offset: parseFloat(active.outlineOffset),
      ring: rgb(active.outlineColor), fill: rgb(active.backgroundColor),
      text: rgb(active.color),
      details: Array.from(row.querySelectorAll('.text-muted-foreground'), detail => rgb(getComputedStyle(detail).color)),
      surface: rgb(getComputedStyle(document.documentElement).getPropertyValue('--popover')),
    };
  })()`).result;
  assert(style.width >= 2 && style.line === "solid" && style.offset <= -2, "Active option needs an unclipped solid outline");
  assert(contrast(style.ring, style.fill) >= 3, "Outline must contrast with the active fill");
  assert(contrast(style.ring, style.surface) >= 3, "Outline must contrast with the surrounding list");
  assert(contrast(style.text, style.fill) >= 4.5, "Active option text must remain readable");
  for (const detail of style.details) {
    assert(contrast(detail, style.fill) >= 4.5, "Active option descriptions must remain readable");
  }
}

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

  openFrame("New order");
  ab("find", "role", "button", "click", "--name", "Line 1 SKU");
  ab("fill", "[cmdk-input]", "Pils");
  wait("document.querySelectorAll('[cmdk-item]').length === 1");
  ab("press", "Enter");
  wait("!document.querySelector('[cmdk-input]')");
  ab("find", "role", "button", "click", "--name", "Line 1 SKU");
  ab("fill", "[cmdk-input]", "Hazy");
  wait("document.querySelectorAll('[cmdk-item]').length === 1");
  ab("click", "[cmdk-item]");
  wait("!document.querySelector('[cmdk-input]')");
  for (const mode of ["light", "dark"]) {
    ab("eval", `localStorage.setItem('theme', ${JSON.stringify(mode)}); document.documentElement.classList.toggle('dark', ${mode === "dark"})`);
    ab("open", `${base}/docs/screens-explore`);
    wait("document.querySelector('[aria-label=Screens] button')");
    chooseScreen("Search");
    ab("fill", "[cmdk-input]", "Hazy");
    wait("document.querySelectorAll('[cmdk-item]').length === 2");
    checkHighlight('[cmdk-item][aria-selected="true"]');
    ab("press", "ArrowDown");
    wait("document.querySelector('[cmdk-item][aria-selected=true]')?.textContent.includes('ORD-0231')");
    checkHighlight('[cmdk-item][aria-selected="true"]');
    assert.equal(ab("eval", `Array.from(document.querySelectorAll('[cmdk-item][aria-selected=false]')).every(row => getComputedStyle(row).outlineStyle !== 'solid')`).result, true, "Inactive options must not keep the active outline");

    openFrame("New order");
    ab("find", "role", "button", "click", "--name", "Line 1 SKU");
    checkHighlight('[cmdk-item][aria-selected="true"]');
    ab("press", "ArrowDown");
    checkHighlight('[cmdk-item][aria-selected="true"]');
    ab("press", "Enter");
    wait("!document.querySelector('[cmdk-input]')");

    openFrame("Edit material");
    ab("focus", '[data-slot="select-trigger"][aria-label="Kind"]');
    ab("press", "ArrowDown");
    checkHighlight('[data-slot="select-item"][data-highlighted]');
    ab("press", "ArrowDown");
    checkHighlight('[data-slot="select-item"][data-highlighted]');
    ab("press", "Enter");
    wait("!document.querySelector('[data-slot=select-content]')");
    console.log(`${mode}: Search, SKU/searchPick, and Select have visible keyboard highlights with AA text and 3:1 outlines.`);
  }
  console.log("Palette smoke passed: filtering, empty state, arrow keys, Enter, and click return.");
} finally {
  ab("close");
}

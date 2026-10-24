// Run against this worktree's already-running dev server; no database writes or fixtures are seeded.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { SCREENS } from "../components/mgr/screens";

const origin = process.argv[2];
assert.ok(origin, "Pass the running worktree origin, for example http://localhost:3253");
const session = "queue-1303-strip-batches-layout-regression";
function browser(...args: string[]) {
  const response = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 60000 }));
  assert.equal(response.success, true, response.error);
  return response.data;
}

try {
  for (const name of ["Batches", "Price groups"]) {
    const index = SCREENS.findIndex(screen => screen.name === name);
    assert.ok(index >= 0, `Missing ${name} inventory record`);
    // 110%, 250%, and 300% equivalents of a 1280 × 800 desktop, plus a phone.
    for (const [width, height] of [[1280, 800], [1164, 727], [512, 320], [427, 267], [390, 844]]) {
      browser("set", "viewport", String(width), String(height));
      browser("open", `${origin}/screens/frame/${index}`);
      browser("wait", "--fn", "!!document.querySelector('[data-mgr-composer]')");
      browser("wait", "--fn", "!document.querySelector('[data-mgr-composer]').getAnimations().some(a => a.playState === 'running')");
      const result = browser("eval", `(() => {
        const page = document.querySelector('[data-mgr-page-scroll]');
        const rect = page.getBoundingClientRect();
        const composer = document.querySelector('[data-mgr-composer]');
        const handle = composer.querySelector('button');
        const h = handle.getBoundingClientRect();
        const nav = document.querySelector('nav[aria-label=Tabs]');
        const n = nav.getBoundingClientRect();
        const strip = document.querySelector('[role=tablist]');
        const tables = [...page.querySelectorAll('[data-slot=table-container]')].filter(e => e.getBoundingClientRect().width > 0);
        return {
          documentOverflow: document.documentElement.scrollWidth > innerWidth,
          pageOverflow: page.scrollWidth > page.clientWidth,
          tableOverflows: tables.map(e => e.scrollWidth - e.clientWidth),
          pageBottom: rect.bottom, navTop: n.top, handleTop: h.top,
          bottomBand: innerHeight - rect.bottom,
          handleReachable: handle.parentElement.contains(document.elementFromPoint(h.x+h.width/2,h.y+h.height/2)),
          strip: { overflowY: getComputedStyle(strip).overflowY, scrollbarWidth: getComputedStyle(strip).scrollbarWidth, role: strip.getAttribute('role') },
        };
      })()`).result;
      console.log(JSON.stringify({ name, width, height, ...result }));
      assert.equal(result.documentOverflow, false, `${name} ${width}: document overflow`);
      if (name === "Batches") {
        assert.equal(result.pageOverflow, false, `${name} ${width}: page overflow`);
        assert.ok(result.tableOverflows.every((overflow: number) => overflow <= 1), `${name} ${width}: fitting tables must not scroll horizontally`);
      } else {
        assert.equal(result.strip.overflowY, "hidden", "Pricing channel strip is horizontal only");
        assert.equal(result.strip.scrollbarWidth, "none", "Pricing channel strip hides native scrollbar chrome");
        assert.equal(result.strip.role, "tablist");
      }
      assert.equal(result.handleReachable, true, `${name} ${width}: collapsed conversation control is reachable`);
      if (width < 768) {
        assert.ok(result.bottomBand <= 50, `${name} ${width}: only one bottom row is reserved`);
        assert.ok(Math.abs(result.pageBottom - result.navTop) <= 1, "Page ends above navigation");
        assert.ok(Math.abs(result.navTop - result.handleTop) <= 1, "Conversation control shares navigation row");
      }
    }
  }
  // Keyboard users retain all three drawer states without invoking an AI prompt.
  browser("focus", 'button[aria-label="Open Ask MGR"]');
  browser("press", "Enter");
  browser("wait", "--fn", "!!document.querySelector('button[aria-label=\"Expand Ask MGR\"]')");
  browser("press", "Enter");
  browser("wait", "--fn", "!!document.querySelector('button[aria-label=\"Minimize Ask MGR\"]')");
  browser("press", "Enter");
  browser("wait", "--fn", "!!document.querySelector('button[aria-label=\"Open Ask MGR\"]')");
  console.log("Conversation control: keyboard open, expand, minimize passed");
} finally {
  browser("close");
}

// Browser regression: command actions must paint above phone chrome, not merely accept clicks.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { SCREENS } from "../components/mgr/screens";

const readingIndex = SCREENS.findIndex(record => record.name === "Fermentation reading");
assert.ok(readingIndex >= 0, "Missing Fermentation reading fixture");
let session = `mobile-surface-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12)}-${process.pid}`;
const socket = createServer();
await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const origin = `http://localhost:${port}`;
let server: ChildProcess | undefined;
let startupOutput = "";
let spawnError: Error | undefined;
let browserStarted = false;

async function cleanup() {
  if (browserStarted) {
    try { browser("close"); } catch (error) { console.error("Browser cleanup failed:", error); }
    browserStarted = false;
  }
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") console.error("Server cleanup failed:", error); }
    // Next's child releases the dev lock after the launcher exits; wait for both.
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try { process.kill(-server.pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    server = undefined;
  }
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, async () => { await cleanup(); process.exit(signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 129); });
}

function browser(...args: string[]) {
  if (args[0] !== "close") browserStarted = true;
  const output = execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 });
  const response = JSON.parse(output);
  if (!response.success) throw new Error(response.error);
  return response.data;
}

async function start() {
  // Fixture frames need no login, seed, command submission, or database reset.
  if (existsSync(".next/dev/lock")) throw new Error("Existing .next/dev/lock: stop this worktree's dev server before running the browser regression; no existing process will be stopped.");
  server = spawn("bun", ["run", "dev", "--port", String(port)], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", chunk => { startupOutput = (startupOutput + String(chunk)).slice(-12000); });
  server.stderr?.on("data", chunk => { startupOutput = (startupOutput + String(chunk)).slice(-12000); });
  server.on("error", error => { spawnError = error; });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Measurement server exited before readiness: ${startupOutput}`);
    try { if ((await fetch(origin + `/screens/frame/${readingIndex}`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch { /* Next has not bound its port yet. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Fixture frame did not become ready within startup deadline: ${startupOutput}`);
}

try {
  await start();
  for (const coarse of [false, true]) {
    if (coarse) {
      browser("close");
      session += "-coarse";
      // Device presets change viewport/UA only; ask Chromium for its native coarse-pointer sizing.
      browser("set", "viewport", "390", "844", "--args", "--blink-settings=primaryPointerType=2");
    }
  for (const [screen, action] of [["Fermentation reading", "Save reading"], ["Cycle count", "Record count"]]) {
    const index = SCREENS.findIndex(record => record.name === screen);
    assert.ok(index >= 0, `Missing screen ${screen}`);
    for (const [width, height] of [[390, 844], [390, 500], [1024, 768]]) {
      browser("set", "viewport", String(width), String(height));
      browser("open", `${origin}/screens/frame/${index}`);
      browser("wait", "--text", action);
      browser("wait", "--fn", `!!document.querySelector('[data-slot=sheet-content],[data-slot=dialog-content]')`);
      browser("wait", "--fn", `!document.querySelector('[data-slot=sheet-content],[data-slot=dialog-content]').getAnimations().some(animation => animation.playState === 'running')`);
      if (screen === "Cycle count") {
        browser("find", "role", "combobox", "click", "--name", "Location");
        browser("wait", "--fn", "!!document.querySelector('[role=listbox]')");
        const popup = browser("eval", `(() => {
          const list = document.querySelector('[role=listbox]');
          const surface = document.querySelector('[data-slot=sheet-content],[data-slot=dialog-content]');
          const r = list.getBoundingClientRect();
          const item = list.querySelector('[role=option]:not([data-disabled])');
          const i = item.getBoundingClientRect();
          const hit = document.elementFromPoint(i.x + i.width / 2, i.y + i.height / 2);
          const popupZ = Number(getComputedStyle(list.parentElement).zIndex);
          const covering = [...document.querySelectorAll('nav[aria-label=Tabs],[data-mgr-composer]')].some(e => {
            const c = e.getBoundingClientRect();
            const layer = e.hasAttribute('data-mgr-composer') ? e.parentElement : e;
            return c.width > 0 && c.top < r.bottom && c.bottom > r.top && c.left < r.right && c.right > r.left && Number(getComputedStyle(layer).zIndex) > popupZ;
          });
          return popupZ >= Number(getComputedStyle(surface).zIndex) && !covering && (hit === item || item.contains(hit));
        })()`);
        assert.equal(popup.result, true, "Count Location Select opens above command surface");
        if (process.argv[2]) browser("screenshot", `${process.argv[2]}/count-picker-${width}x${height}-green.png`);
        browser("press", "Escape");
      }
      // A focused field in a reduced viewport exercises keyboard-space layout, not a physical OS keyboard.
      browser("find", "label", screen === "Cycle count" ? "Counted (each)" : "Temperature (°F)", "click");
      const { result } = browser("eval", `(() => {
        const button = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(action)});
        const surface = button.closest('[data-slot=sheet-content],[data-slot=dialog-content]');
        const body = [...surface.children].find(e => getComputedStyle(e).overflowY === 'auto');
        if (!body) throw new Error("Command surface is missing its scroll body");
        body.scrollTop = body.scrollHeight;
        const r = button.getBoundingClientRect();
        const z = Number(getComputedStyle(surface).zIndex);
        const chrome = [...document.querySelectorAll('nav[aria-label=Tabs],[data-slot=drawer-popup]')];
        const covering = chrome.filter(e => {
          const c = e.getBoundingClientRect();
          const layer = e.matches('[data-slot=drawer-popup]') ? e.parentElement : e;
          return c.width > 0 && c.height > 0 && c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top && Number(getComputedStyle(layer).zIndex) > z;
        });
        const points = [[r.x + r.width / 2, r.y + r.height / 2], [r.left + 2, r.y + r.height / 2], [r.right - 2, r.y + r.height / 2], [r.x + r.width / 2, r.top + 2], [r.x + r.width / 2, r.bottom - 2]];
        return { coarse: matchMedia('(pointer: coarse)').matches, visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight, covering: covering.map(e => e.getAttribute('aria-label') || e.dataset.slot), reachable: points.every(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit === button || button.contains(hit); }) };
      })()`);
      assert.equal(result.coarse, coarse, "Pointer emulation must match scenario");
      assert.equal(result.visible, true, `${screen} ${width}x${height}: action outside viewport`);
      assert.deepEqual(result.covering, [], `${screen} ${width}x${height}: chrome paints above action`);
      assert.equal(result.reachable, true, `${screen} ${width}x${height}: action hit target`);
      console.log(JSON.stringify({ screen, width, height, ...result }));
      if (process.argv[2]) browser("screenshot", `${process.argv[2]}/${screen === "Cycle count" ? "count" : "reading"}-${width}x${height}-${coarse ? "coarse" : "fine"}-green.png`);
    }
  }
  // Inline packaging controls share the shell, not CommandForm's modal precedence.
    for (const [screen, selector] of [
      ["Close packaging run", '[aria-label="Finished goods bin"]'],
      ["Run closed", 'button'],
    ]) {
      const index = SCREENS.findIndex(record => record.name === screen);
      assert.ok(index >= 0, `Missing screen ${screen}`);
      browser("set", "viewport", "1280", "577");
      browser("open", `${origin}/screens/frame/${index}`);
      browser("wait", "--text", screen === "Run closed" ? "Correction reason" : "Finished goods bin");
      if (screen === "Run closed") browser("find", "label", "Correction reason", "fill", "Correct observed material loss");
      const measurement = browser("eval", `(() => {
        const control = ${screen === "Run closed" ? "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Correct material actuals')" : `document.querySelector(${JSON.stringify(selector)})`};
        const scroller = document.querySelector('[data-mgr-page-scroll]');
        if (!scroller) throw new Error('Missing bounded page scroll region');
        control.scrollIntoView({ block: 'center' });
        const bounds = scroller.getBoundingClientRect();
        const r = control.getBoundingClientRect();
        const composer = document.querySelector('[data-mgr-composer]').getBoundingClientRect();
        const points = [[r.x + r.width / 2, r.y + r.height / 2], [r.left + 2, r.y + r.height / 2], [r.right - 2, r.y + r.height / 2], [r.x + r.width / 2, r.top + 2], [r.x + r.width / 2, r.bottom - 2]];
        return {
          coarse: matchMedia('(pointer: coarse)').matches,
          disabled: control.disabled,
          pageBottom: bounds.bottom,
          composerTop: composer.top,
          rect: r.toJSON(),
          reachable: points.every(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit === control || control.contains(hit); }),
          contained: r.top >= bounds.top && r.bottom <= bounds.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      })()`).result;
      assert.equal(measurement.coarse, coarse, "Pointer emulation must match scenario");
      assert.equal(measurement.disabled, false, `${screen}: enabled control`);
      assert.ok(measurement.pageBottom <= measurement.composerTop + 1, `${screen}: page must not scroll behind collapsed composer`);
      assert.equal(measurement.contained, true, `${screen}: control within page scroll region`);
      assert.equal(measurement.reachable, true, `${screen}: center and edges hit the actual control`);
      assert.equal(measurement.overflow, false, `${screen}: no document overflow`);
      if (screen === "Close packaging run") {
        browser("find", "role", "combobox", "click", "--name", "Finished goods bin");
        browser("wait", "--fn", "!!document.querySelector('[role=listbox]')");
        browser("find", "role", "option", "click", "--name", "Dry", "--exact");
      } else {
        // The fixture simulates only local state; this does not submit a live correction.
        browser("find", "role", "button", "click", "--name", "Correct material actuals", "--exact");
      }
      console.log(JSON.stringify({ screen, width: 1280, height: 577, ...measurement }));
      if (process.argv[2]) browser("screenshot", `${process.argv[2]}/packaging-${index}-${coarse ? "coarse" : "fine"}-green.png`);
    }
    for (const [screen, action] of [
      ["Close packaging run", "Finished goods bin"],
      ["Run closed", "Correct material actuals"],
      ["Fermentation reading", "Save reading"],
      ["Cycle count", "Record count"],
    ]) {
      const index = SCREENS.findIndex(record => record.name === screen);
      browser("open", `${origin}/docs/screens-explore#s=${index}`);
      browser("wait", "--fn", "document.querySelector('.screen-box')?.contains(document.querySelector('[data-mgr-composer]'))");
      if (screen === "Run closed") browser("find", "label", "Correction reason", "fill", "Review observed material loss");
      const embedded = browser("eval", `(() => {
        document.documentElement.classList.toggle('dark', ${coarse});
        const box = document.querySelector('.screen-box');
        const page = box.querySelector('[data-mgr-page-scroll]');
        const composer = box.querySelector('[data-mgr-composer]');
        const control = ${screen === "Close packaging run" ? "box.querySelector('[aria-label=\"Finished goods bin\"]')" : `[...box.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(action)})`};
        box.scrollIntoView({ block: 'center' });
        control.scrollIntoView({ block: 'center' });
        const r = control.getBoundingClientRect();
        const points = [[r.x+r.width/2,r.y+r.height/2],[r.left+2,r.y+r.height/2],[r.right-2,r.y+r.height/2],[r.x+r.width/2,r.top+2],[r.x+r.width/2,r.bottom-2]];
        return {
          contained: box.contains(composer),
          coarse: matchMedia('(pointer: coarse)').matches,
          pageBottom: page.getBoundingClientRect().bottom,
          composerTop: composer.getBoundingClientRect().top,
          rect: r.toJSON(),
          reachable: points.every(([x,y]) => { const hit = document.elementFromPoint(x,y); return hit === control || control.contains(hit); }),
        };
      })()`).result;
      assert.equal(embedded.coarse, coarse);
      assert.equal(embedded.contained, true, `${screen}: composer belongs to explorer container`);
      assert.ok(embedded.pageBottom <= embedded.composerTop + 1, `${screen}: embedded page stops above composer`);
      assert.equal(embedded.reachable, true, `${screen}: embedded control center and edges`);
      console.log(JSON.stringify({ explorer: screen, ...embedded }));
      if (process.argv[2]) browser("screenshot", `${process.argv[2]}/explorer-${index}-${coarse ? "coarse-dark" : "fine-light"}.png`);
      if (screen === "Fermentation reading" || screen === "Cycle count") {
        browser("find", "role", "button", "click", "--name", "Close", "--exact");
        browser("wait", "--fn", "!document.querySelector('.screen-box [data-slot=dialog-content]')");
        assert.equal(browser("eval", "document.querySelector('.screen-box').contains(document.querySelector('[data-mgr-composer]'))").result, true);
      }
    }
  }
  browser("set", "viewport", "390", "844");
  const today = SCREENS.findIndex(record => record.name === "Today");
  browser("open", `${origin}/screens/frame/${today}`);
  browser("wait", "--fn", "!!document.querySelector('[data-mgr-composer]')");
  const tabs = browser("eval", `(() => {
    const nav = document.querySelector('nav[aria-label=Tabs]');
    const drawer = document.querySelector('[data-mgr-composer]');
    return { navZ: Number(getComputedStyle(nav).zIndex), drawerZ: Number(getComputedStyle(drawer.parentElement).zIndex), reachable: [...nav.querySelectorAll('a')].every(a => { const r = a.getBoundingClientRect(); const hit = document.elementFromPoint(r.right - 12, r.y + r.height / 2); return a === hit || a.contains(hit); }) };
  })()`);
  assert.ok(tabs.result.drawerZ < tabs.result.navZ && tabs.result.navZ < 50, "Chrome must stay below modals with Tabs above composer");
  assert.equal(tabs.result.reachable, true, "Tabs must remain usable with minimized composer");
  console.log(JSON.stringify({ minimizedComposer: tabs.result }));
  console.log("PASS: Reading and Count actions, Count Location Select, packaging bin/correction controls with fine and coarse pointers, and minimized-composer Tabs.");
} finally {
  await cleanup();
}

// Fixture-only browser checks against this worktree's running server; no database writes.
// Run: bun tests-e2e/accessibility-followups.ts http://localhost:<printed-port>
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.argv[2];
assert(base, "Pass this worktree's running URL");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local browser regression only");
const session = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim().replaceAll("/", "-");
function ab(...args: string[]) {
  const response = JSON.parse(execFileSync("bunx", ["agent-browser", "--session", session, ...args, "--json"], { encoding: "utf8", timeout: 35000 }));
  assert(response.success, response.error);
  return response.data;
}
function chooseScreen(name: string) {
  ab("find", "role", "option", "click", "--name", name, "--exact");
}
function wait(expression: string) {
  ab("wait", "--fn", `Boolean(${expression})`);
}

function focusedCalendarDay() {
  return ab("eval", `(() => {
    const active = document.activeElement;
    const popup = active.closest('[data-slot=popover-content]');
    if (!popup || !active.dataset.day) return null;
    const rect = active.getBoundingClientRect(), bounds = popup.getBoundingClientRect();
    return {
      day: active.dataset.day, scrollTop: popup.scrollTop,
      insidePopup: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1,
      insideViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
    };
  })()`).result;
}

function checkDesktopTab(direction: "Tab" | "Shift+Tab") {
  ab("find", "role", "button", "click", "--name", "Ask MGR", "--exact");
  ab("find", "label", "Brewery name", "click");
  assert.equal(ab("eval", "document.querySelector('button[aria-keyshortcuts]').getAttribute('aria-expanded')").result, "true", "Uncovered page controls must remain usable beside desktop chat");
  const bounds = ab("eval", "document.querySelector('[data-mgr-composer]').getBoundingClientRect().toJSON()").result;
  for (let stop = 0; stop < 80; stop++) {
    ab("press", direction);
    const focus = ab("eval", `(async () => {
      const { promise, resolve } = Promise.withResolvers();
      requestAnimationFrame(() => requestAnimationFrame(resolve));
      await promise;
      const active = document.activeElement;
      const rect = active.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      return {
        open: document.querySelector('button[aria-keyshortcuts]').getAttribute('aria-expanded') === 'true',
        x, y, visible: top === active || active.contains(top),
        name: active.getAttribute('aria-label') || active.textContent.trim(),
      };
    })()`).result;
    if (!focus.open) {
      assert(focus.x >= bounds.left && focus.x <= bounds.right && focus.y >= bounds.top && focus.y <= bounds.bottom, `${direction} must actually reach a control previously covered by the panel`);
      assert(focus.visible, `${direction} must leave the reached control visible and focused`);
      console.log(`${direction}: Ask MGR yielded to covered control ${focus.name}`);
      return;
    }
  }
  assert.fail(`${direction} did not reach a page control covered by Ask MGR`);
}

try {
  ab("open", `${base}/docs/screens-explore`);
  ab("set", "viewport", "1440", "1000");
  wait("document.querySelector('[aria-label=Screens] button')");
  for (const screen of ["Settings", "Settings no warehouse"]) {
    chooseScreen(screen);
    for (const label of ["One-way keg fee ($)", "Reading overdue after (hours)", "Days to package"]) {
      const selector = `input[aria-label=${JSON.stringify(label)}]`;
      const before = Number(ab("get", "value", selector).value);
      ab("find", "role", "button", "click", "--name", `Increase ${label}`, "--exact");
      wait(`Number(document.querySelector(${JSON.stringify(selector)}).value) === ${before + 1}`);
      ab("find", "role", "button", "click", "--name", `Decrease ${label}`, "--exact");
      wait(`Number(document.querySelector(${JSON.stringify(selector)}).value) === ${before}`);
      assert.equal(ab("eval", "document.querySelector('[aria-label=Screens] [aria-selected=true]')?.textContent.trim()").result, screen, "A step must not navigate the explorer");
    }
  }
  chooseScreen("Settings");
  wait("document.querySelector('#portal-warehouse')");
  const snapshot = ab("snapshot").snapshot;
  assert.match(snapshot, /combobox "Portal fulfillment warehouse"/);
  const requiredMarker = ab("eval", `getComputedStyle(document.querySelector('#portal-warehouse').closest('[data-slot=field]').querySelector('[data-slot=field-label]'), '::after').content`).result;
  assert.match(requiredMarker, /required/, "Required picker must have a visible label marker");
  const frame = ab("eval", `document.querySelector('a[target="_blank"][href^="/screens/frame/"]').href`).result;
  ab("open", frame);
  checkDesktopTab("Tab");
  checkDesktopTab("Shift+Tab");
  ab("set", "viewport", "320", "256");
  wait("document.querySelector('#portal-warehouse')");
  assert(ab("eval", "document.documentElement.scrollWidth <= document.documentElement.clientWidth").result, "Settings must reflow at the 320 CSS-pixel viewport used for 400% zoom");
  assert(ab("eval", "Array.from(document.querySelectorAll('[data-mgr-page-scroll]')).every(x => x.scrollWidth <= x.clientWidth)").result, "Settings page content must not require horizontal scrolling");
  ab("find", "role", "button", "click", "--name", "Corrected books opened on");
  wait("document.querySelector('[data-slot=popover-content]')?.contains(document.activeElement)");
  let calendarFocus = focusedCalendarDay();
  for (let stop = 0; !calendarFocus && stop < 8; stop++) {
    ab("press", "Tab");
    calendarFocus = focusedCalendarDay();
  }
  assert(calendarFocus, "Tab must reach a calendar day");
  let calendarScrolled = false;
  for (let week = 0; week < 6; week++) {
    const previous = calendarFocus;
    ab("keydown", "ArrowDown");
    try {
      wait(`document.activeElement?.dataset.day !== ${JSON.stringify(previous.day)}`);
      calendarFocus = focusedCalendarDay();
      if (!calendarFocus?.insidePopup || !calendarFocus.insideViewport) {
        assert.fail(`Focused calendar day must stay inside both popup and viewport: ${JSON.stringify(calendarFocus)}`);
      }
      calendarScrolled ||= calendarFocus.scrollTop !== previous.scrollTop;
    } finally {
      ab("keyup", "ArrowDown");
    }
  }
  assert(calendarScrolled, "Native calendar keyboard navigation must scroll to keep weeks reachable");
  ab("press", "Escape");
  wait("!document.querySelector('[data-slot=popover-content]')");
  ab("set", "viewport", "1440", "1000");
  ab("open", `${base}/docs/screens-explore`);
  wait("document.querySelector('[aria-label=Screens] button')");
  chooseScreen("Format");
  wait("document.querySelector('[role=radiogroup][aria-label=\"Size of one container unit\"]')");
  ab("find", "role", "radio", "click", "--name", "bbl", "--exact");
  wait("document.querySelector('[role=radio][value=bbl]')?.getAttribute('aria-checked') === 'true'");
  assert.equal(ab("eval", "document.querySelector('[aria-label=Screens] [aria-selected=true]')?.textContent").result, "Format", "A unit choice must not navigate the explorer");
  assert.equal(ab("eval", "document.activeElement?.getAttribute('role') === 'radio' && document.activeElement?.getAttribute('value')").result, "bbl", "Selecting a unit must retain the chosen radio's focus for arrow-key navigation");
  ab("keydown", "ArrowLeft");
  try {
    wait("document.querySelector('[role=radio][value=gal]')?.getAttribute('aria-checked') === 'true'");
  } finally {
    ab("keyup", "ArrowLeft");
  }
  console.log(`${ab("eval", "document.documentElement.classList.contains('dark') ? 'dark' : 'light'").result}: Accessibility browser regression passed: contextual one-step quantity actions, select name and value, visible required marker, forward/reverse Tab past desktop chat, chosen-radio focus, and 320 CSS-pixel Settings and keyboard-calendar reflow (400%-equivalent, not actual browser zoom).`);
} finally {
  ab("close");
}

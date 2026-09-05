// tests/tap-coverage.test.ts — the explorer is a walkable prototype only if
// taps land somewhere: every link, button and row title in every MGR screen is
// run through lib/mgr/screen-links.ts and the misses are counted. Chrome that
// acts in place (steppers, the composer's History, tabs, chips, selects, the
// sidebar toggle) is not a tap to resolve. Set REPORT=<file> to write the
// misses per area, which is how the rules get written.
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { area, SCREENS, type Screen } from "../components/mgr/screens";
import { INERT, resolveTap } from "../lib/mgr/screen-links";
import { ScreenFrame } from "../components/mgr/screen-frame";

const text = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const INERT_ATTR = /role="tab"|role="switch"|toggle-group-item|sidebar-trigger|select-trigger|sidebar-menu-button|data-gated/;
const INERT_LABEL = /^[−+]$|^History$/;
const inert = (l: string) => INERT_LABEL.test(l) || INERT.some((k) => (typeof k === "string" ? k === l : k.test(l)));

/** Every tap on a screen: [label, href, data-to]. */
function taps(html: string): [string, string | null, string | null][] {
  const out: [string, string | null, string | null][] = [];
  for (const m of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const attrs = m[2];
    const label = /aria-label="([^"]*)"/.exec(attrs)?.[1] ?? text(m[3]);
    if (!label || INERT_ATTR.test(attrs) || inert(label)) continue;
    out.push([label, /href="([^"]*)"/.exec(attrs)?.[1] ?? null, /data-to="([^"]*)"/.exec(attrs)?.[1] ?? null]);
  }
  for (const m of html.matchAll(/data-slot="item-title"[^>]*>([\s\S]*?)<\/div>/g)) if (!inert(text(m[1]))) out.push([text(m[1]), null, null]);
  return out;
}

const markup = (s: Screen) => s.surface === "sheet" ? renderToStaticMarkup(createElement("div", null, s.body)) : renderToStaticMarkup(createElement(ScreenFrame, { screen: s }));

it("resolves every tap in every MGR screen", () => {
  const byArea = new Map<string, string[]>();
  let total = 0, missed = 0;
  for (const s of SCREENS) {
    if (s.venue) continue;
    // The shell for a page; a sheet's body directly, since its dialog is
    // portaled and closed on first paint and would render nothing.
    const html = markup(s);
    const all = taps(html);
    const miss = [...new Set(all.filter(([l, h, t]) => !resolveTap(s, l, h, t)).map(([l]) => l))];
    total += all.length; missed += miss.length;
    if (miss.length) byArea.set(area(s), [...(byArea.get(area(s)) ?? []), `${s.name} (${s.surface ?? "page"}): ${miss.join(" | ")}`]);
  }
  if (process.env.REPORT) {
    writeFileSync(process.env.REPORT, [`taps ${total} missed ${missed}`, ...[...byArea].flatMap(([a, lines]) => ["", `## ${a}`, ...lines])].join("\n"));
  }
  expect(missed, "unresolved taps (run with REPORT=<file> for the list)").toBe(0);
});


it("includes controls inside portaled sheets", () => {
  for (const [name, label] of [["Mapping conflict", "Use"], ["Square → QuickBooks connector", "Understood"], ["Portal Me", "Change password"], ["Square locations", "Save mappings"]]) {
    const screen = SCREENS.find(s => s.name === name)!;
    expect(taps(markup(screen)).map(([label]) => label), name).toContain(label);
  }
});

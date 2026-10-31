// tests/tap-coverage.test.ts — the explorer is a walkable prototype only if
// taps land somewhere: every link, button and row title in every MGR screen is
// run through lib/mgr/screen-links.ts and the misses are counted. Chrome that
// acts in place (steppers, tabs, chips, selects, the
// sidebar toggle) is not a tap to resolve. Set REPORT=<file> to write the
// misses per area, which is how the rules get written.
import { writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { area, SCREENS, type Screen } from "../components/mgr/screens";
import { isInertOn, resolveTap } from "../lib/mgr/screen-links";
import { ScreenFrame } from "../components/mgr/screen-frame";

// React escapes these characters in SSR; the live explorer reads decoded textContent.
const text = (h: string) => h.replace(/<[^>]+>/g, "")
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const INERT_ATTR = /role="tab"|role="switch"|toggle-group-item|sidebar-trigger|select-trigger|sidebar-menu-button|data-gated|data-preview-action/;
const INERT_LABEL = /^[−+]$/;
// The explorer's own rule, so the coverage report matches what a tap does:
// a screen that maps an INERT label meant it, and that tap must resolve.
const inert = (s: Screen, l: string, to?: string | null) => INERT_LABEL.test(l) || isInertOn(s, l, to);

/** Every tap on a screen: [label, href, data-to]. */
function taps(s: Screen, html: string): [string, string | null, string | null][] {
  const out: [string, string | null, string | null][] = [];
  for (const m of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const attrs = m[2];
    const labelId = /aria-labelledby="([^"]*)"/.exec(attrs)?.[1].split(/\s+/)[0];
    const labelAt = labelId ? html.indexOf(`id="${labelId}"`) : -1;
    const labelledText = labelAt < 0 ? undefined : /^[^>]*>([\s\S]*?)<\/[^>]+>/.exec(html.slice(labelAt))?.[1];
    const label = labelledText === undefined ? /aria-label="([^"]*)"/.exec(attrs)?.[1] ?? text(m[3]) : text(labelledText);
    const to = /data-to="([^"]*)"/.exec(attrs)?.[1] ?? null;
    if (/href="https:\/\//.test(attrs)) continue;
    if (!label || INERT_ATTR.test(attrs) || inert(s, label, to)) continue;
    out.push([label, /href="([^"]*)"/.exec(attrs)?.[1] ?? null, to]);
  }
  // A row whose control is a toggle acts in place, so its title is not a tap:
  // the switch lives in a sibling slot, so the whole item is the unit to test.
  // Matching item-by-item is what keeps every switch row out of the count
  // without hand-listing each one in INERT.
  for (const item of html.split(/data-slot="item"(?=[\s>])/).slice(1)) {
    const t = /data-slot="item-title"[^>]*>([\s\S]*?)<\/div>/.exec(item);
    // Every switch in the inventory sits in a row's action slot, so a chunk
    // holding one is a toggle row: its title acts in place and is not a tap.
    if (!t || /role="switch"/.test(item) || /<select\b|<button\b[^>]*aria-labelledby=/.test(t[1])) continue;
    // RecordTable's href=null names are plain text, not whole-record links.
    const attributes = item.slice(0, item.indexOf(">"));
    if (!/\bdata-row\b/.test(attributes) && !/<(?:a|button)\b/.test(t[1])) continue;
    if (!inert(s, text(t[1]))) out.push([text(t[1]), null, null]);
  }
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
    const all = taps(s, html);
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
  for (const [name, label] of [["Map to QuickBooks", "Save mapping"], ["Portal Me", "Change password"]]) {
    const screen = SCREENS.find(s => s.name === name)!;
    expect(taps(screen, markup(screen)).map(([label]) => label), name).toContain(label);
  }
});

it("does not treat native select options in a row title as navigation", () => {
  const screen = SCREENS.find(s => s.name === "New PO")!;
  expect(taps(screen, '<div data-slot="item"><div data-slot="item-title"><select><option>Unknown material</option></select></div><button>Save draft</button></div>'))
    .toEqual([["Save draft", null, null]]);
});

it("uses a picker's field label for navigation instead of its selected value", () => {
  const screen = SCREENS.find(s => s.name === "New PO")!;
  const picker = '<button aria-labelledby="material-label material-value"><span id="material-label" hidden>Material</span><span id="material-value">Citra · hop</span></button>';
  expect(taps(screen, picker)).toEqual([["Material", null, null]]);
});

it("does not treat a searchable picker inside a row title as record navigation", () => {
  const screen = SCREENS.find(s => s.name === "New order")!;
  const picker = '<button aria-labelledby="sku-label sku-value"><span id="sku-label" hidden>Line 1 SKU</span><span id="sku-value">Hazy IPA · ½ bbl keg</span></button>';
  expect(taps(screen, `<div data-slot="item"><div data-slot="item-title">${picker}</div></div>`)).toEqual([]);
});

it("does not treat a plain record name as navigation but still follows record links", () => {
  const screen = SCREENS.find(s => s.name === "Pars and allocation")!;
  const plain = '<div data-slot="item"><div data-slot="item-title"><span>Plain SKU</span></div></div>';
  const linked = '<div data-slot="item"><div data-slot="item-title"><a href="/inventory/sku">Linked SKU</a></div></div>';
  expect(taps(screen, plain)).toEqual([]);
  expect(taps(screen, linked)).toEqual([["Linked SKU", "/inventory/sku", null], ["Linked SKU", null, null]]);
});

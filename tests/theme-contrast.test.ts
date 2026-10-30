import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { E } from "@/components/mgr/e";
import { applyStoredTheme, THEME_BOOT, ThemeBoot } from "@/components/mgr/theme-boot";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const rgb = (hex: string) => hex.match(/[a-f\d]{2}/gi)!.map((v) => parseInt(v, 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
// The color `top` painted at `alpha` (0-1) over the color `under`.
const over = (top: string, alpha: number, under: string) => toHex(rgb(top).map((v, i) => v * alpha + rgb(under)[i] * (1 - alpha)));
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (x: string, y: string) => {
  const [a, b] = [luminance(x), luminance(y)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// Hex colors and direct color aliases in one theme block (":root" or ".dark").
const tokensOf = (mode: string) => {
  const block = css.slice(css.indexOf(`${mode} {`)).split("}")[0];
  const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)].map((m) => [m[1], m[2]]));
  for (const [, name, target] of block.matchAll(/--([\w-]+):\s*var\(--([\w-]+)\)/g)) {
    tokens[name] = tokens[target];
  }
  return tokens;
};

for (const mode of [":root", ".dark"]) {
  const tokens = tokensOf(mode);

  it(`${mode} semantic text pairs meet AA contrast`, () => {
    for (const role of ["primary", "destructive", "irreversible", "warning", "success", "attention", "info"]) {
      expect(tokens[role], role).toBeDefined();
      expect(contrast(tokens[role], tokens[`${role}-foreground`]), `${role} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // These three also render as text (row actions, error copy, links) on every surface.
  it(`${mode} primary, destructive and irreversible meet AA as text on every surface`, () => {
    for (const role of ["primary", "destructive", "irreversible"]) {
      for (const surface of ["background", "card", "popover"]) {
        expect(contrast(tokens[role], tokens[surface]), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it(`${mode} control borders and the unchecked Switch meet non-text contrast`, () => {
    for (const surface of ["background", "card", "popover"]) {
      for (const role of ["control-border", "input"]) {
        expect(contrast(tokens[role], tokens[surface]), `${role} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
      // Stock Switch uses an 80% input fill and a foreground thumb in dark mode.
      const track = mode === ".dark" ? over(tokens.input, 0.8, tokens[surface]) : tokens.input;
      const thumb = mode === ".dark" ? tokens.foreground : tokens.background;
      expect(contrast(track, tokens[surface]), `unchecked track on ${surface}`).toBeGreaterThanOrEqual(3);
      expect(contrast(thumb, track), `unchecked thumb on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// The server sends an executable script; a browser render gets a text/plain
// data block, which React neither runs nor warns about (#239, #986).
it("ThemeBoot's script runs from the server and stays inert in a browser render", () => {
  expect(layout).toMatch(/<head>\s*<ThemeBoot \/>/);
  expect(renderToStaticMarkup(createElement(ThemeBoot))).toContain('type="text/javascript"');
  vi.stubGlobal("window", {});
  expect(renderToStaticMarkup(createElement(ThemeBoot))).toContain('type="text/plain"');
});

// global-error replaces the root layout, so it brings its own document, the
// global styles and ThemeBoot, or a root layout failure renders unthemed (#1069).
it("app/global-error.tsx renders its own themed document", () => {
  const globalError = readFileSync(new URL("../app/global-error.tsx", import.meta.url), "utf8");
  expect(globalError).toMatch(/^"use client";/m);
  expect(globalError).toContain('import "./globals.css";');
  expect(globalError).toMatch(/<html[^>]*suppressHydrationWarning[\s\S]*<head>\s*<ThemeBoot \/>[\s\S]*<body/);
  expect(globalError).toContain("<RootError error={error} retry={retry} />");
});

// A notFound() or a throw before the shell flushes makes Next send its bare
// error document and render the root layout on the client, where the inline
// script can't run (#986). ThemeBoot's layout effect applies the same rule.
it("applies the stored or OS theme, as a function and as the inline script (#986)", () => {
  const runs = { function: applyStoredTheme, script: () => new Function(THEME_BOOT)() as void };
  for (const [how, run] of Object.entries(runs)) {
    for (const [stored, osDark, dark] of [["dark", false, true], ["light", true, false], [null, true, true], [null, false, false]] as const) {
      const classes = new Set<string>();
      vi.stubGlobal("localStorage", { getItem: () => stored });
      vi.stubGlobal("matchMedia", () => ({ matches: osDark }));
      vi.stubGlobal("document", { documentElement: { classList: { add: (c: string) => classes.add(c) } } });
      run();
      expect(classes.has("dark"), `${how}: stored ${stored}, OS dark ${osDark}`).toBe(dark);
    }
  }
});

// Location Uses is drawn by E.picks in both the inventory and the live dialog
// (LocationFields, #1148), so the multi-select owns the bright on-state.
it("paints selected Location Uses with the AA-checked primary pair, not the hover wash (#493)", () => {
  const e = readFileSync(new URL("../components/mgr/e.tsx", import.meta.url), "utf8");
  expect(e).toContain('export const BRIGHT_ON = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";');
  const picks = /\n  picks: [\s\S]*?\n  \),\n/.exec(e)?.[0] ?? "";
  expect(picks.match(/<ToggleGroupItem[^>]*className=\{BRIGHT_ON\}/g)).toHaveLength(2);
  const location = readFileSync(new URL("../components/mgr/views/location.tsx", import.meta.url), "utf8");
  expect(location).toMatch(/E\.picks\("Uses"/);
});

// A row action (E.act) paints its tone's fill over the page surface at rest,
// and over the tap row's accent/50 hover wash when hovered (#1041). The test
// renders each E.act, so the classes are the ones the Button merges (the ghost
// variant plus the tone). In dark mode a dark: class beats its plain twin.
// Primary and destructive drop their 10% tint in dark: hovered, it fell below
// AA on every surface, and at rest on popovers (#1065).
it("keeps every row-action tone at AA, at rest and hovered, in both modes (#1041, #1065)", () => {
  const e = readFileSync(new URL("../components/mgr/e.tsx", import.meta.url), "utf8");
  expect(e).toMatch(/has-\[\[data-tap\]\]:hover:bg-accent\/50/);
  for (const mode of [":root", ".dark"]) {
    const tokens = tokensOf(mode);
    const dark = mode === ".dark";
    // The `<prefix><kind>-<token>[/<percent>]` class naming a theme color or
    // transparent, with exactly this variant prefix: [token, percent?] or undefined.
    const color = (classes: string, prefix: string, kind: "bg" | "text") =>
      [...classes.matchAll(new RegExp(`(?:^| )${prefix}${kind}-([\\w-]+?)(?:/(\\d+))?(?= |$)`, "g"))]
        .map((m) => m.slice(1))
        .find(([token]) => token === "transparent" || token in tokens);
    // No fill class, or bg-transparent, paints nothing over `under`.
    const paint = ([token, percent = "100"]: string[], under: string) =>
      token === "transparent" ? under : over(tokens[token], Number(percent) / 100, under);
    for (const role of ["primary", "destructive", "success", "attention", "info"] as const) {
      const classes = renderToStaticMarkup(E.act("Go", role)).match(/class="([^"]*)"/)![1];
      const pick = (state: "" | "hover:", kind: "bg" | "text") => (dark && color(classes, `dark:${state}`, kind)) || color(classes, state, kind);
      const rest = pick("", "bg") ?? ["transparent"];
      const hover = pick("hover:", "bg") ?? rest;
      const text = pick("", "text")![0];
      const hoverText = pick("hover:", "text")?.[0] ?? text;
      for (const surface of ["background", "card", "popover"]) {
        const atRest = paint(rest, tokens[surface]);
        const hovered = paint(hover, over(tokens.accent, 0.5, tokens[surface]));
        expect(contrast(tokens[text], atRest), `${mode} ${role} at rest on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tokens[hoverText], hovered), `${mode} ${role} hovered on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

// The shadcn Button and Badge destructive variants paint destructive-foreground
// on a solid destructive fill, the pair E.btn del uses (#1079). A tint under
// destructive text failed AA in dark cards and popovers. Hover paints the fill
// at a declared percent over the surface, so that blend is checked too.
it("keeps the Button and Badge destructive variants at AA, at rest and on hover (#1079)", () => {
  for (const file of ["button", "badge"]) {
    const source = readFileSync(new URL(`../components/ui/${file}.tsx`, import.meta.url), "utf8");
    const variant = source.match(/destructive:\s*"([^"]*)"/)![1];
    expect(variant, `${file} destructive`).toMatch(/^bg-destructive text-destructive-foreground /);
    expect(variant, `${file} destructive has no dark tint`).not.toMatch(/dark:(hover:)?bg-destructive\//);
    const percent = Number(variant.match(/hover:bg-destructive\/(\d+)/)![1]);
    for (const mode of [":root", ".dark"]) {
      const tokens = tokensOf(mode);
      for (const surface of ["background", "card", "popover"]) {
        const hovered = over(tokens.destructive, percent / 100, tokens[surface]);
        expect(contrast(tokens["destructive-foreground"], hovered), `${file} ${mode} hover on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

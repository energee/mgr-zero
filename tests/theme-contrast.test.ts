import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const luminance = (hex: string) => {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (x: string, y: string) => {
  const [a, b] = [luminance(x), luminance(y)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

// The hex color tokens declared in one globals.css block (":root" or ".dark").
const tokensOf = (mode: string) => {
  const block = css.slice(css.indexOf(`${mode} {`)).split("}")[0];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)].map((m) => [m[1], m[2]]));
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
}

it("keeps the pre-paint theme script inert on React client remounts", () => {
  expect(layout).toMatch(/type=\{typeof window === "undefined" \? "text\/javascript" : "text\/plain"\}/);
  expect(layout).toMatch(/<script[\s\S]*suppressHydrationWarning/);
});

it("paints selected Location Uses with the AA-checked primary pair, not the hover wash (#493)", () => {
  const e = readFileSync(new URL("../components/mgr/e.tsx", import.meta.url), "utf8");
  expect(e).toContain('export const BRIGHT_ON = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";');
  const form = readFileSync(new URL("../app/(app)/locations/location-form.tsx", import.meta.url), "utf8");
  expect(form).toMatch(/<ToggleGroupItem[^>]*className=\{BRIGHT_ON\}/);
});

// A hovered row action (E.act) paints its tone over the tap row's accent/50
// hover wash, over the page surface (#1041). Primary and destructive are a tint
// under tone-colored text; success, attention and info are a solid fill at /80
// under their -foreground text. Light mode only: in dark, the ghost Button's
// dark:hover:bg-muted/50 replaces the tone on hover.
it("keeps every hovered row-action tone at AA in light mode (#1041)", () => {
  const e = readFileSync(new URL("../components/mgr/e.tsx", import.meta.url), "utf8");
  const tokens = tokensOf(":root");
  const rgb = (hex: string) => hex.match(/[a-f\d]{2}/gi)!.map((v) => parseInt(v, 16));
  const over = (top: string, alpha: number, under: number[]) => rgb(top).map((v, i) => v * alpha + under[i] * (1 - alpha));
  const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  expect(e).toMatch(/has-\[\[data-tap\]\]:hover:bg-accent\/50/);
  for (const role of ["primary", "destructive", "success", "attention", "info"]) {
    const [, percent, text] = e.match(new RegExp(`hover:bg-${role}/(\\d+) hover:text-(${role}(?:-foreground)?)"`))!;
    for (const surface of ["background", "card", "popover"]) {
      const hovered = over(tokens[role], Number(percent) / 100, over(tokens.accent, 0.5, rgb(tokens[surface])));
      expect(contrast(tokens[text], toHex(hovered)), `${role} hover on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

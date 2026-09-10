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

for (const mode of [":root", ".dark"]) {
  it(`${mode} semantic text pairs meet AA contrast`, () => {
    const block = css.slice(css.indexOf(`${mode} {`)).split("}")[0];
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6})/gi)].map((m) => [m[1], m[2]]));
    for (const role of ["primary", "destructive", "irreversible", "warning", "success", "attention", "info"]) {
      expect(tokens[role], role).toBeDefined();
      const a = luminance(tokens[role]);
      const b = luminance(tokens[`${role}-foreground`]);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), `${role} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

it("keeps the pre-paint theme script inert on React client remounts", () => {
  expect(layout).toMatch(/type=\{typeof window === "undefined" \? "text\/javascript" : "text\/plain"\}/);
  expect(layout).toMatch(/<script[\s\S]*suppressHydrationWarning/);
});

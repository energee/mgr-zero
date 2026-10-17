import { createRequire } from "node:module";
import { micromark } from "micromark";
import { math, mathHtml } from "micromark-extension-math";
import { describe, expect, it } from "vitest";

// Exercise the renderer resolved by the affected transitive consumer, not an
// unrelated hoisted copy that could already be patched.
const requireMath = createRequire(import.meta.resolve("micromark-extension-math"));
const katex = requireMath("katex") as {
  renderToString(expression: string, options?: Record<string, unknown>): string;
};

describe("transitive math renderer (#934)", () => {
  it("renders inline and display math through micromark's HTML extension", () => {
    const html = micromark("Inline $x^2$.\n\n$$\n\\frac{1}{2}\n$$", {
      extensions: [math()],
      htmlExtensions: [mathHtml()],
    });
    expect(html).toContain('class="math math-inline"');
    expect(html).toContain('class="math math-display"');
    expect(html).toContain('class="katex"');
    expect(html).toContain("<math");
    expect(html).not.toContain("katex-error");
  });

  it("does not inherit trusted rendering from an options prototype", () => {
    const options = Object.assign(Object.create({ trust: true }), { strict: "ignore" });
    const html = katex.renderToString("\\href{https://example.invalid}{link}", options);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain('href="https://example.invalid"');
  });

  it("still permits explicitly trusted safe links", () => {
    const html = katex.renderToString("\\href{https://example.invalid}{link}", { trust: true });
    expect(html).toContain('href="https://example.invalid"');
  });
});

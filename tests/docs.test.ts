// tests/docs.test.ts — the customer guides are body fragments under content/docs
// rendered by app/(docs)/docs/[guide]; lib/docs.ts is the loader.
import { describe, expect, it } from "vitest";
import { GUIDES, readGuide } from "@/lib/docs";

describe("guide loader", () => {
  it("lists the three guides and reads each as a styled fragment", () => {
    expect(GUIDES).toEqual(["user-guide", "staff-guide", "portal-guide"]);
    for (const guide of GUIDES) {
      const { html, title } = readGuide(guide);
      expect(title).toBeTruthy();
      expect(html).toContain("<main");
      // Fragments inherit app/globals.css; a self-styled page would fork the design.
      expect(html).not.toMatch(/<(?:!doctype|html|head|body|style|script|link)\b/i);
    }
  });

  it("rejects an unknown guide", () => {
    expect(() => readGuide("nope")).toThrow();
  });
});

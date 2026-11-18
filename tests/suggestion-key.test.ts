/** Tab accepts a field's suggestion only as a plain Tab on an empty value. */
import { describe, expect, it } from "vitest";
import { acceptedSuggestion } from "@/lib/mgr/suggestion-key";

const plain = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

describe("acceptedSuggestion", () => {
  it("accepts a plain Tab on an empty value", () => {
    expect(acceptedSuggestion({ ...plain, key: "Tab" }, "", "hop")).toBe("hop");
  });

  it.each([
    ["Shift+Tab", { ...plain, key: "Tab", shiftKey: true }],
    ["Ctrl+Tab", { ...plain, key: "Tab", ctrlKey: true }],
    ["Alt+Tab", { ...plain, key: "Tab", altKey: true }],
    ["Meta+Tab", { ...plain, key: "Tab", metaKey: true }],
    ["Enter", { ...plain, key: "Enter" }],
  ])("ignores %s", (_name, event) => {
    expect(acceptedSuggestion(event, "", "hop")).toBeNull();
  });

  it("ignores a filled value", () => {
    expect(acceptedSuggestion({ ...plain, key: "Tab" }, "malt", "hop")).toBeNull();
  });

  it("ignores a missing or empty suggestion", () => {
    expect(acceptedSuggestion({ ...plain, key: "Tab" }, "", undefined)).toBeNull();
    expect(acceptedSuggestion({ ...plain, key: "Tab" }, "", "")).toBeNull();
  });
});

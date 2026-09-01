// Proves committed chat previews contain only safe portable fixture data.
import { describe, expect, it } from "vitest";
import { assertPortableNotification } from "@/lib/chat/contracts";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";

const forbiddenKeys = new Set([
  "email", "phone", "price", "balance", "licenseNumber", "signature",
  "freeTextNote", "token", "secret", "address",
]);
const keys = (value: unknown): string[] =>
  value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)])
    : [];

const expectedIds = [
  "settings-disconnected", "settings-active", "link", "app-home", "personal-dm",
  "team-digest", "preferences", "fermentation-gated", "order-confirm-gated", "reauthorization",
] as const;

describe("chat preview fixtures", () => {
  it("provides the ten committed preview scenarios with unique IDs", () => {
    expect(CHAT_PREVIEW_FIXTURES.map((fixture) => fixture.id)).toEqual(expectedIds);
    expect(new Set(CHAT_PREVIEW_FIXTURES.map((fixture) => fixture.id)).size).toBe(CHAT_PREVIEW_FIXTURES.length);
  });

  it("validates every portable item and excludes sensitive keys and values", () => {
    for (const fixture of CHAT_PREVIEW_FIXTURES) {
      for (const item of fixture.items) {
        expect(() => assertPortableNotification(item)).not.toThrow();
      }
      expect(keys(fixture).filter((key) => forbiddenKeys.has(key))).toEqual([]);
      expect(JSON.stringify(fixture)).not.toMatch(/xox[baprs]-|-----BEGIN|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    }
  });

  it("keeps the team digest aggregate-only", () => {
    const fixture = CHAT_PREVIEW_FIXTURES.find(({ id }) => id === "team-digest");
    expect(fixture).toBeDefined();
    expect(fixture?.items).toEqual([]);
    expect(fixture?.fields).toEqual([
      { label: "Submitted orders", value: "2 · need sales review" },
      { label: "Picks due", value: "2 · warehouse queue" },
      { label: "Assigned deliveries", value: "1 · next stops ready" },
      { label: "Fermentation readings", value: "1 · overdue" },
    ]);
  });

  it("keeps gated operational forms disabled and directs people to MGR", () => {
    for (const id of ["fermentation-gated", "order-confirm-gated"] as const) {
      const fixture = CHAT_PREVIEW_FIXTURES.find((candidate) => candidate.id === id);
      expect(fixture?.actions).toEqual([{ id: "open_mgr", label: id === "fermentation-gated" ? "Open in MGR" : "Open order in MGR", enabled: true }]);
      expect(fixture?.fields.some(({ value }) => value.includes("Open this") || value.includes("full MGR review"))).toBe(true);
    }
  });
});

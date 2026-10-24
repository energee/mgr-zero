// Query freshness is an instant in the brewery zone, never the viewer's clock.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryFeedback } from "@/components/mgr/query-feedback";

const updatedAt = Date.parse("2026-01-01T00:30:00Z");
const render = (props: Partial<Parameters<typeof QueryFeedback>[0]> = {}) => renderToStaticMarkup(createElement(QueryFeedback, { timeZone: "America/Los_Angeles", updatedAt, ...props }));

describe("query freshness", () => {
  it.each([
    ["America/Los_Angeles", "Dec 31, 2025, 4:30 PM"],
    ["Asia/Tokyo", "Jan 1, 2026, 9:30 AM"],
  ])("uses the brewery day and wall clock in %s across midnight", (timeZone, expected) => {
    const html = render({ timeZone });
    expect(html).toContain(expected);
    expect(html).toContain('dateTime="2026-01-01T00:30:00.000Z"');
    expect(html).not.toMatch(/role="(?:status|alert)"/);
  });

  it.each([
    ["2026-03-08T09:59:00Z", "Mar 8, 2026, 1:59 AM"],
    ["2026-03-08T10:00:00Z", "Mar 8, 2026, 3:00 AM"],
  ])("respects brewery daylight saving at %s", (instant, expected) => {
    expect(render({ updatedAt: Date.parse(instant) })).toContain(expected);
  });

  it("keeps the same zone for successful, paused and failed refreshes", () => {
    expect(render({ fetching: true })).toContain("Updating… Last checked");
    for (const props of [{ paused: true }, { error: new Error("Refresh failed") }]) {
      const html = render(props);
      expect(html).toContain("Showing last-known data");
      expect(html).toContain("Dec 31, 2025, 4:30 PM");
    }
    expect(render({ error: new Error("Refresh failed") })).toContain("Try again");
  });

  it("does not invent a successful check for an unread query", () => {
    expect(render({ updatedAt: 0 })).toBe("");
    const html = render({ updatedAt: 0, loading: "Loading orders" });
    expect(html).toContain("Loading orders");
    expect(html).not.toContain("Last checked");
  });

  it("can omit timestamps on unsaved forms without hiding refresh or cached-data feedback", () => {
    expect(render({ showCheckedAt: false })).toBe("");
    expect(render({ showCheckedAt: false, fetching: true })).toContain("Updating");
    for (const props of [{ paused: true }, { error: new Error("Refresh failed") }]) {
      const html = render({ ...props, showCheckedAt: false });
      expect(html).toContain("Showing last-known data");
      expect(html).not.toContain("Last checked");
    }
    expect(render({ showCheckedAt: false, error: new Error("Refresh failed") })).toContain("Try again");
  });
});

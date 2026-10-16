// QW24 (narrowed): a result or prediction that is not an error reaches a screen
// reader through a polite, always-mounted role="status" region; an error keeps
// E.note's role="alert". E.note and E.info themselves stay alerts (the global
// sweep is a separate issue).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeView } from "@/components/mgr/views/recipe";
import { PublicationResult, SyncFeedback } from "@/components/mgr/views/pos-controls";
import { recipeHazyV4 } from "@/lib/mgr/fixtures/production";

type ExactCommand = Parameters<typeof PublicationResult>[0]["action"];
const command = (over: Partial<Record<string, unknown>>) =>
  ({ requestId: null, result: null, failure: null, busy: false, ...over }) as unknown as ExactCommand;
const noop = () => {};
/** The inner HTML of the one role="status" region, or null when there is none. */
const statusRegion = (html: string) => html.match(/<div role="status">([\s\S]*?)<\/div>/)?.[1] ?? null;

describe("hint roles", () => {
  it("RecipeView renders Predicted inside a polite status region, not an alert", () => {
    const html = renderToStaticMarkup(createElement(RecipeView, { model: recipeHazyV4 }));
    expect(statusRegion(html)).toContain("Predicted: OG 15.2 °P");
    expect(html).not.toMatch(/role="alert"[^>]*>(?:(?!<\/div>)[\s\S])*Predicted:/);
  });

  it("RecipeView keeps the status region mounted before anything is predicted", () => {
    const html = renderToStaticMarkup(createElement(RecipeView, { model: { title: "New recipe", notes: "" }, controls: { set: noop, onSubmit: noop } }));
    expect(statusRegion(html)).toBe("");
  });

  it("a POS publication result is always mounted as status; a success fills it", () => {
    expect(statusRegion(renderToStaticMarkup(createElement(PublicationResult, { action: command({}), onRetry: noop, onCorrected: noop })))).toBe("");
    const html = renderToStaticMarkup(createElement(PublicationResult, {
      action: command({ requestId: "r1", result: { publication: { attemptId: "r1", status: "succeeded", errorCode: null } } }), onRetry: noop, onCorrected: noop,
    }));
    expect(statusRegion(html)).toContain("Published");
    expect(html).not.toContain('role="alert"');
  });

  it("a rejected POS publication stays an alert and leaves the status region empty", () => {
    const html = renderToStaticMarkup(createElement(PublicationResult, {
      action: command({ requestId: "r2", result: { publication: { attemptId: "r2", status: "rejected", errorCode: "version_mismatch" } } }), onRetry: noop, onCorrected: noop,
    }));
    expect(statusRegion(html)).toBe("");
    expect(html).toMatch(/role="alert"[\s\S]*r2/);
  });

  it("a completed sync is status; a failed sync is an alert", () => {
    const html = renderToStaticMarkup(createElement(SyncFeedback, { runs: [
      ["Catalog", command({ requestId: "c1", result: { locations: 1, variations: 2 } })],
      ["Sales", command({ requestId: "s1", failure: { kind: "definitive", message: "Forbidden" } })],
    ] }));
    expect(statusRegion(html)).toContain("Catalog sync complete · attempt c1");
    expect(statusRegion(html)).not.toContain("Sales");
    expect(html).toMatch(/role="alert"[\s\S]*Sales sync stopped · Forbidden/);
  });

  it("a superseded sync stays an alert", () => {
    const html = renderToStaticMarkup(createElement(SyncFeedback, { runs: [
      ["Catalog", command({ requestId: "c2", result: { synced: false, superseded: true } })],
    ] }));
    expect(statusRegion(html)).toBe("");
    expect(html).toMatch(/role="alert"[\s\S]*Catalog sync superseded/);
  });
});

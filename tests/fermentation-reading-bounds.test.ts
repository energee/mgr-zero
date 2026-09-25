// Issue #468: a fermentation reading must reject impossible temperature and pH
// at the schema (a 400 the outbox treats as permanent), not overflow the
// numeric columns into a 500 the outbox retries forever. The form carries the
// same bounds so the browser stops the value before it is queued.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fermentationReadingInput, READING_BOUNDS } from "@/lib/composer/offline-policy";
import { FermentationReadingView } from "@/components/mgr/views/fermentation-reading";

const base = { occupancyId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", at: "2026-09-23T12:00:00.000Z", tempF: 66 };

describe("fermentation reading bounds (#468)", () => {
  it("accepts normal readings", () => {
    expect(fermentationReadingInput.safeParse({ ...base, ph: 4.4, gravityPlato: 12.5 }).success).toBe(true);
    expect(fermentationReadingInput.safeParse({ ...base, tempF: 34 }).success).toBe(true);
  });

  it("rejects -500 °F and pH 20", () => {
    expect(fermentationReadingInput.safeParse({ ...base, tempF: -500 }).success).toBe(false);
    expect(fermentationReadingInput.safeParse({ ...base, tempF: 10000 }).success).toBe(false);
    expect(fermentationReadingInput.safeParse({ ...base, ph: 20 }).success).toBe(false);
    expect(fermentationReadingInput.safeParse({ ...base, ph: -1 }).success).toBe(false);
  });

  it("accepts the bounds themselves", () => {
    expect(fermentationReadingInput.safeParse({ ...base, tempF: READING_BOUNDS.tempF.min, ph: READING_BOUNDS.ph.min }).success).toBe(true);
    expect(fermentationReadingInput.safeParse({ ...base, tempF: READING_BOUNDS.tempF.max, ph: READING_BOUNDS.ph.max }).success).toBe(true);
  });

  it("the form's temperature and pH fields carry the same min and max", () => {
    const html = renderToStaticMarkup(createElement(FermentationReadingView, {
      formId: "f", unit: "plato",
      values: { observedAt: "", tempF: "66", gravity: "", ph: "4.4", note: "" },
    }));
    const attrs = (id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    expect(attrs("fr-temp")).toContain(`min="${READING_BOUNDS.tempF.min}"`);
    expect(attrs("fr-temp")).toContain(`max="${READING_BOUNDS.tempF.max}"`);
    expect(attrs("fr-ph")).toContain(`min="${READING_BOUNDS.ph.min}"`);
    expect(attrs("fr-ph")).toContain(`max="${READING_BOUNDS.ph.max}"`);
  });
});

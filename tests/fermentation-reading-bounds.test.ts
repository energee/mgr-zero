// Issue #468: a fermentation reading must reject impossible temperature and pH
// at the schema (a 400 the outbox treats as permanent), not overflow the
// numeric columns into a 500 the outbox retries forever. The form carries the
// same bounds so the browser stops the value before it is queued.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fermentationReadingInput, READING_BOUNDS } from "@/lib/composer/offline-policy";
import { FermentationReadingActionsView, FermentationReadingView } from "@/components/mgr/views/fermentation-reading";
import { readingValidation } from "@/lib/mgr/fermentation-reading-view";
import { parseGravity } from "@/lib/mgr/gravity-unit";

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

  it("names a tank, a batch, or both, never neither (readings-on-batch); bounds apply to each", () => {
    const { occupancyId, ...rest } = base;
    const batchId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    expect(fermentationReadingInput.safeParse({ ...rest, occupancyId }).success).toBe(true);
    expect(fermentationReadingInput.safeParse({ ...rest, batchId }).success).toBe(true);
    expect(fermentationReadingInput.safeParse({ ...rest, batchId, occupancyId }).success).toBe(true);
    expect(fermentationReadingInput.safeParse(rest).success).toBe(false);
    expect(fermentationReadingInput.safeParse({ ...rest, batchId, tempF: 10 }).success).toBe(false);
  });

  it("temperature is optional when gravity or pH is given; a reading needs at least one value", () => {
    const { tempF: _t, ...noTemp } = base;
    expect(fermentationReadingInput.safeParse({ ...noTemp, gravityPlato: 12 }).success).toBe(true);
    expect(fermentationReadingInput.safeParse({ ...noTemp, ph: 5.2 }).success).toBe(true);
    expect(fermentationReadingInput.safeParse(noTemp).success).toBe(false);
    expect(fermentationReadingInput.safeParse({ ...noTemp, note: "looked fine" }).success).toBe(false);
  });

  it("accepts the bounds themselves", () => {
    expect(fermentationReadingInput.safeParse({ ...base, tempF: READING_BOUNDS.tempF.min, ph: READING_BOUNDS.ph.min }).success).toBe(true);
    expect(fermentationReadingInput.safeParse({ ...base, tempF: READING_BOUNDS.tempF.max, ph: READING_BOUNDS.ph.max }).success).toBe(true);
  });

  it("the form's temperature and pH fields carry the same min and max", () => {
    const html = renderToStaticMarkup(createElement(FermentationReadingView, {
      formId: "f", unit: "plato", timeZone: "America/New_York", identity: { vessel: "FV3" },
      values: { observedAt: "", tempF: "66", gravity: "", ph: "4.4", note: "" },
    }));
    const attrs = (id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
    expect(attrs("fr-temp")).toContain(`min="${READING_BOUNDS.tempF.min}"`);
    expect(attrs("fr-temp")).toContain(`max="${READING_BOUNDS.tempF.max}"`);
    expect(attrs("fr-ph")).toContain(`min="${READING_BOUNDS.ph.min}"`);
    expect(attrs("fr-ph")).toContain(`max="${READING_BOUNDS.ph.max}"`);
  });
  it("withholds Save reading with a named reason for invalid measurements in either gravity unit", () => {
    const values = { observedAt: "2026-10-25T10:00:00", tempF: "66", gravity: "", ph: "", note: "" };
    for (const unit of ["plato", "sg"] as const) {
      for (const patch of [{ ph: "-1" }, { ph: "15" }, { ph: "1e1" }, { tempF: "24" }, { gravity: "1e1" }]) {
        const html = renderToStaticMarkup(createElement(FermentationReadingActionsView, { formId: "f", values: { ...values, ...patch }, unit }));
        expect(html).toContain('disabled=""');
        expect(html).toContain("Still needed:");
      }
      for (const ph of ["", "0", "14"]) {
        const html = renderToStaticMarkup(createElement(FermentationReadingActionsView, { formId: "f", values: { ...values, ph }, unit }));
        expect(html).not.toContain('disabled=""');
      }
    }
  });
  it("preserves unit-aware gravity boundaries and conversion, including fermented negative Plato", () => {
    const values = { observedAt: "2026-10-25T10:00:00", tempF: "66", gravity: "", ph: "" };
    for (const [unit, gravity] of [["plato", "-3"], ["plato", "0"], ["plato", "40"], ["sg", "0.9"], ["sg", "0.998"], ["sg", "1.000"], ["sg", "1.2"], ["sg", "1050"]] as const) {
      const validation = readingValidation({ ...values, gravity }, unit);
      expect(validation.reason).toBeNull();
      expect(validation.measurements?.gravityPlato).toBe(parseGravity(gravity, unit));
    }
    for (const [unit, gravity] of [["plato", "-30"], ["plato", "41"], ["sg", "-3"], ["sg", "0"], ["sg", "0.899"], ["sg", "1.201"]] as const) {
      const validation = readingValidation({ ...values, gravity }, unit);
      expect(validation.reason).not.toBeNull();
      expect(validation.measurements).toBeNull();
      expect(validation.errors.gravity).toBeTruthy();
    }
  });
  it("does not revalidate a frozen exact retry against edited draft fields", () => {
    const html = renderToStaticMarkup(createElement(FermentationReadingActionsView, {
      formId: "f", unit: "sg",
      values: { observedAt: "", tempF: "", gravity: "-3", ph: "15", note: "" },
      recovery: { state: "uncertain", discardLabel: "FV3 reading" },
    }));
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("Still needed:");
    expect(html).toContain("Retry exact reading");
  });
  it("keeps pH zero in the fresh payload and links field-local corrections", () => {
    const values = { observedAt: "2026-10-25T10:00:00", tempF: "66", gravity: "1050", ph: "0", note: "" };
    expect(readingValidation(values, "sg").measurements).toEqual({ tempF: 66, gravityPlato: parseGravity("1050", "sg"), ph: 0 });
    const html = renderToStaticMarkup(createElement(FermentationReadingView, {
      formId: "f", unit: "sg", identity: { vessel: "FV3" }, values: { ...values, ph: "15" },
    }));
    const input = html.match(/<input[^>]*id="fr-ph"[^>]*>/)?.[0];
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('aria-describedby="fr-ph-error"');
    expect(html).toContain('id="fr-ph-error"');
  });
});

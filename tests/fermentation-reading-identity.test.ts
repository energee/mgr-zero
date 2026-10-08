// Issue #716: the reading sheet names the tank (and the batch when known) so
// an operator arriving from Today can confirm where the measurement lands.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FermentationReadingView, readingIdentity } from "@/components/mgr/views/fermentation-reading";

const values = { observedAt: "", tempF: "", gravity: "", ph: "", note: "" };
const render = (identity: { vessel: string; batch?: string }) =>
  renderToStaticMarkup(createElement(FermentationReadingView, { formId: "f", unit: "sg", values, identity }));

describe("fermentation reading identity (#716)", () => {
  it("shows the vessel and the batch", () => {
    const html = render({ vessel: "FV3", batch: "Batch 416 · Hazy IPA" });
    expect(html).toContain("FV3");
    expect(html).toContain("Batch 416 · Hazy IPA");
  });

  it("shows the vessel alone when no batch is known", () => {
    expect(render({ vessel: "FV3" })).toContain("FV3");
    expect(render({ vessel: "FV3" })).not.toContain("Batch");
  });

  it("builds identity from an occupancy without inventing missing facts", () => {
    expect(readingIdentity({ vessel_name: "FV3", batch_no: 416, brand_name: "Hazy IPA" })).toEqual({ vessel: "FV3", batch: "Batch 416 · Hazy IPA" });
    expect(readingIdentity({ vessel_name: "FV3", batch_no: 416, brand_name: null })).toEqual({ vessel: "FV3", batch: "Batch 416" });
    expect(readingIdentity({ vessel_name: "FV3", batch_no: null, brand_name: "Hazy IPA" })).toEqual({ vessel: "FV3", batch: "Hazy IPA" });
    expect(readingIdentity({ vessel_name: null, batch_no: null, brand_name: null })).toEqual({ vessel: "unknown vessel" });
  });
});

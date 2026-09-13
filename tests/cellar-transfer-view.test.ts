import { describe, expect, it } from "vitest";
import { transferPreview } from "../lib/mgr/cellar-transfer-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CellarTransferView } from "../components/mgr/views/cellar-transfer";
import { cellarTransferPils } from "../lib/mgr/fixtures/production";

describe("cellar transfer preview", () => {
  it("shares the blend, remainder and explicit partial-loss controls without replacing the footer", () => {
    const html = renderToStaticMarkup(createElement(CellarTransferView, { model: cellarTransferPils, footer: null, messages: "Transfer failed", submitting: true }));
    expect(html).toContain("Blend preview: BT1 7 + 3 = 10 / 10 bbl");
    expect(html).toContain("B-0412");
    expect(html).toContain("9.8 bbl");
    expect(html).toContain("Loss (bbl) · optional");
    expect(html).toContain("Transfer failed");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Record transfer");
  });
  it("never treats an untransferred remainder as loss", () => {
    expect(transferPreview(12.8, "3", "")).toEqual({ moving: 3, loss: 0, remainder: 9.8, valid: true });
    expect(transferPreview(12.8, "3", "2")).toEqual({ moving: 3, loss: 2, remainder: 7.8, valid: true });
    expect(transferPreview(12.8, "3", "9.8").remainder).toBe(0);
  });
  it("rejects missing, nonfinite, negative and overdrawn quantities", () => {
    for (const [available, moving, loss] of [[undefined, "3", ""], [12, "", ""], [12, "Infinity", ""], [12, "3", "-1"], [12, "3", "10"], [12, "-3", ""]] as const) {
      expect(transferPreview(available, moving, loss).valid).toBe(false);
    }
  });
});

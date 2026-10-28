import { describe, expect, it } from "vitest";
import { transferDestinations, transferPreview, transferReason } from "../lib/mgr/cellar-transfer-view";
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
  it("excludes the source vessel and invalidates a stale same-vessel destination", () => {
    const source = cellarTransferPils.occupancies.find(o => o.occupancy_id === cellarTransferPils.fromId)!;
    expect(transferDestinations(cellarTransferPils).some(v => v.id === source.vessel_id)).toBe(false);
    expect(transferReason({ ...cellarTransferPils, toId: source.vessel_id })).toContain("destination");
    expect(transferReason(cellarTransferPils)).toBeNull();
  });
  it("names every blocked quantity, including exponent notation and over-source loss", () => {
    for (const volume of ["0", "-1", "", "1e1"]) {
      expect(transferReason({ ...cellarTransferPils, volume })).toContain("barrels moving above zero");
      expect(transferPreview(12.8, volume, "").valid).toBe(false);
    }
    expect(transferReason({ ...cellarTransferPils, volume: "13" })).toContain("at most 12.8 bbl");
    expect(transferReason({ ...cellarTransferPils, volume: "3", loss: "10" })).toContain("at most 12.8 bbl");
    expect(transferReason({ ...cellarTransferPils, loss: "-1" })).toContain("loss of zero or more");
    expect(transferReason({ ...cellarTransferPils, occupancies: [] })).toContain("source tank");
  });
  it("#1479 holds the volume to the room left in the destination", () => {
    // BT1 holds 7 of 10 bbl; BT2 is empty at 10 bbl.
    expect(transferReason({ ...cellarTransferPils, volume: "3.5" })).toBe("Still needed: at most 3 bbl into BT1.");
    expect(transferReason({ ...cellarTransferPils, volume: "3" })).toBeNull();
    expect(transferReason({ ...cellarTransferPils, toId: "bt2", volume: "10.5" })).toBe("Still needed: at most 10 bbl into BT2.");
    expect(transferReason({ ...cellarTransferPils, toId: "bt2", volume: "10" })).toBeNull();
  });
});

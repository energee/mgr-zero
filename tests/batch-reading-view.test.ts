import { formatVesselReading } from "@/lib/mgr/vessel-detail-view";
import { expect, it } from "vitest";
import { batchesFromQuery } from "@/lib/mgr/batches-view";

it("keeps split occupancies and absent readings explicit with exact recording links", () => {
  const batch = { id: "batch", batch_no: 1, planned_on: "2026-09-27", planned_bbl: 10, brewed_on: "2026-09-27", closed_at: null, cancelled_at: null, brand_name: "Pils", recipe_name: null, vessel_name: "FV1, FV2", active_occupancies: [
    { id: "first", vessel_name: "FV1", latest_reading: { id: "reading", at: "2026-09-27T12:00:00Z", temp_f: 68, gravity_plato: 5, ph: null, note: null } },
    { id: "second", vessel_name: "FV2", latest_reading: null },
  ] };
  const model = batchesFromQuery([batch], [], { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}`, reading: id => `/cellar/${id}/reading` });
  expect(model.active?.[0]).toMatchObject({ batchNo: "B-0001", brand: "Pils", recipe: null, brewable: false, href: "/batches/batch", readings: [
    { key: "first", vessel: "FV1", reading: expect.stringContaining("5.0 °P"), href: "/cellar/first/reading" },
    { key: "second", vessel: "FV2", reading: "No readings yet", href: "/cellar/second/reading" },
  ] });
  expect(batchesFromQuery([batch], []).active?.[0].readings?.[0].href).toBeUndefined();
  // No open occupancy is an empty list, not a reading and not a string glued to another fact.
  expect(batchesFromQuery([{ ...batch, active_occupancies: [] }], []).active?.[0].readings).toEqual([]);
});

it("preserves an absent temperature instead of printing a synthetic value", () => {
  expect(formatVesselReading({ id: "r", at: "2026-09-27", temp_f: null, gravity_plato: 5, ph: null, note: null }, "plato")).toBe("5.0 °P");
});

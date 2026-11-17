import { formatLatestReading, formatVesselReading } from "@/lib/mgr/vessel-detail-view";
import { expect, it } from "vitest";
import { batchesFromQuery, fermentationState } from "@/lib/mgr/batches-view";

it("keeps split occupancies and absent readings explicit with exact recording links", () => {
  const batch = { id: "batch", batch_no: 1, planned_on: "2026-09-27", planned_bbl: 10, brewed_on: "2026-09-27", closed_at: null, cancelled_at: null, brand_name: "Pils", recipe_name: null, vessel_name: "FV1, FV2", active_occupancies: [
    { id: "first", vessel_name: "FV1", latest_reading: { id: "reading", at: "2026-09-27T12:00:00Z", temp_f: 68, gravity_plato: 5, ph: null, note: null } },
    { id: "second", vessel_name: "FV2", latest_reading: null },
  ] };
  const model = batchesFromQuery([batch], [], { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}`, reading: id => `/cellar/${id}/reading` });
  expect(model.active?.[0]).toMatchObject({ batchNo: "B-0001", brand: "Pils", recipe: null, href: "/batches/batch", readings: [
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

it("leaves the note out of a list's latest reading and keeps it on Vessel detail", () => {
  const reading = { id: "r", at: "2026-09-27T12:00:00Z", temp_f: 69, gravity_plato: 5, ph: 4.14, note: "Lolev fermentation" };
  const latest = formatLatestReading(reading, "plato", "UTC");
  expect(latest).toMatch(/^5\.0 °P · 69 °F · pH 4\.14 · /);
  expect(latest).not.toContain("Lolev fermentation");
  expect(formatVesselReading(reading, "plato")).toBe("5.0 °P · 69 °F · pH 4.14 · Lolev fermentation");
});

it("gives a tank its current ABV and attenuation from the batch's first gravity and the tank's latest", () => {
  const latest = { id: "latest", at: "2026-09-29T12:00:00Z", temp_f: 68, gravity_plato: 5 as number | null, ph: null, note: null };
  const batch = { id: "batch", batch_no: 1, planned_on: "2026-09-27", planned_bbl: 10, brewed_on: "2026-09-27", closed_at: null, cancelled_at: null, brand_name: "Pils", recipe_name: null, vessel_name: "FV1",
    og_reading: { id: "og", gravity_plato: 20 }, active_occupancies: [{ id: "first", vessel_name: "FV1", latest_reading: latest }] };
  const tank = (row: typeof batch | Omit<typeof batch, "og_reading">) => batchesFromQuery([row], []).active![0].readings![0];
  expect(tank(batch)).toMatchObject({ abv: "8.3%", attenuation: "76%" });
  // One gravity reading is the OG alone: nothing has fermented yet, so there is no figure.
  expect(tank({ ...batch, og_reading: { id: "latest", gravity_plato: 5 } })).not.toHaveProperty("abv");
  // A latest reading with no gravity, and a batch with no gravity reading, give none either.
  expect(tank({ ...batch, active_occupancies: [{ id: "first", vessel_name: "FV1", latest_reading: { ...latest, gravity_plato: null } }] })).not.toHaveProperty("attenuation");
  const { og_reading: _none, ...noGravity } = batch;
  expect(tank(noGravity)).not.toHaveProperty("abv");
});

it("gives a completed batch its final ABV and attenuation from its first and last gravity readings", () => {
  const batch = { id: "batch", batch_no: 1, planned_on: "2026-09-27", planned_bbl: 10, brewed_on: "2026-09-27", closed_at: "2026-10-10T00:00:00Z", cancelled_at: null, brand_name: "Pils", recipe_name: null, vessel_name: null,
    og_reading: { id: "og", gravity_plato: 20 }, fg_reading: { id: "fg", gravity_plato: 5 }, active_occupancies: [] };
  const done = (row: typeof batch) => batchesFromQuery([row], []).completed![0];
  expect(done(batch)).toMatchObject({ abv: "8.3%", attenuation: "76%" });
  // One gravity reading is both first and last: the figures stay blank, and the columns still draw.
  expect(done({ ...batch, fg_reading: batch.og_reading })).toMatchObject({ abv: "", attenuation: "" });
});

const gravity = (at: string, gravity_plato: number) => ({ id: at, at, gravity_plato });

it("calls a tank Finished once its last two gravities hold within 0.2 °P at least a day apart", () => {
  expect(fermentationState([])).toBeUndefined();
  expect(fermentationState([gravity("2026-09-27T12:00:00Z", 5)])).toBeUndefined();
  expect(fermentationState([gravity("2026-09-28T12:00:00Z", 4.8), gravity("2026-09-27T12:00:00Z", 5)])).toBe("Finished");
  // Under a day apart proves nothing yet; a falling gravity is still fermenting.
  expect(fermentationState([gravity("2026-09-28T11:00:00Z", 5), gravity("2026-09-27T12:00:00Z", 5)])).toBe("Fermenting");
  expect(fermentationState([gravity("2026-09-29T12:00:00Z", 4.5), gravity("2026-09-27T12:00:00Z", 5)])).toBe("Fermenting");
});

it("figures ABV from the newest gravity reading, so a later temperature check does not blank it", () => {
  const batch = { id: "batch", batch_no: 1, planned_on: "2026-09-20", planned_bbl: 10, brewed_on: "2026-09-20", closed_at: null, cancelled_at: null, brand_name: "Pils", recipe_name: null, vessel_name: "FV1",
    og_reading: { id: "og", gravity_plato: 15 }, active_occupancies: [{ id: "first", vessel_name: "FV1",
      latest_reading: { id: "temp", at: "2026-09-29T12:00:00Z", temp_f: 34, gravity_plato: null, ph: null, note: null },
      recent_gravity: [gravity("2026-09-28T12:00:00Z", 3), gravity("2026-09-27T12:00:00Z", 3.1)] }] };
  expect(batchesFromQuery([batch], []).active?.[0].readings?.[0]).toMatchObject({ abv: expect.stringMatching(/^\d+\.\d%$/), attenuation: expect.stringMatching(/%$/), state: "Finished" });
});

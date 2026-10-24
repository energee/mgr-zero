// Vessel UI validation follows numeric(10,3); the command preserves historical
// raw payloads so its RPC can check replay before enforcing new-write limits.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { vesselCapacityError, vesselReason } from "@/lib/mgr/vessel-detail-view";
import { VesselDetailView } from "@/components/mgr/views/vessel-detail";
import { vesselCapacity } from "@/lib/vessel-capacity";

const input = { name: "FV precision", kind: "fermenter" };

it.each([0.0001, 0.0009, 0.0011, 1.2345, 10_000_000, Infinity, NaN])("refuses new form capacity %s before storage rounds it", capacity => {
  expect(vesselCapacity.safeParse(capacity).success).toBe(false);
  expect(vesselCapacityError(String(capacity))).toBeDefined();
  expect(vesselReason({ name: input.name, capacity: String(capacity) })).not.toBeNull();
});

it.each([0.001, 0.01, 0.009, 1.001, 25.555, 100, 9_999_999.999])("accepts exact numeric(10,3) capacity %s without rounding", capacity => {
  expect(vesselCapacity.parse(capacity)).toBe(capacity);
  expect(vesselCapacityError(String(capacity))).toBeUndefined();
  expect(vesselReason({ name: input.name, capacity: String(capacity) })).toBeNull();
});

it("uses the actual stored bounds and precision in the shared inventory/live field", () => {
  const html = renderToStaticMarkup(createElement(VesselDetailView, { model: { title: "New vessel", name: input.name, type: "Fermenter", typeOptions: ["Fermenter"], capacity: "0.0001" } }));
  expect(html).toContain('min="0.001"');
  expect(html).toContain('max="9999999.999"');
  expect(html).toContain('step="0.001"');
  expect(html).toContain("Capacity must be at least 0.001 bbl.");
  expect(html).toContain('aria-invalid="true"');
});

it("refuses exponent notation in the typed capacity without rejecting the numeric API value", () => {
  expect(vesselCapacityError("1e2")).toContain("not exponent notation");
  expect(vesselReason({ name: input.name, capacity: "1e2" })).not.toBeNull();
  expect(getCommandDefinition("upsert_vessel")!.input.parse({ ...input, capacityBbl: 100 })).toMatchObject({ capacityBbl: 100 });
});

it("keeps previously accepted raw command values available for RPC replay", () => {
  expect(getCommandDefinition("upsert_vessel")!.input.parse({ ...input, capacityBbl: 1.2345 })).toMatchObject({ capacityBbl: 1.2345 });
});

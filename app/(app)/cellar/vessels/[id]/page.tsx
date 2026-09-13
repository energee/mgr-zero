import { notFound } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery } from "@/lib/mgr/page-query";
import { VesselForm } from "@/app/(app)/batches/vessel-form";
import { formatVesselReading, VESSEL_TYPES, type VesselReading } from "@/lib/mgr/vessel-detail-view";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { batNo } from "@/lib/mgr/doc-no";
import "@/lib/commands/all";

type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };
type Occupancy = { occupancy_id: string; vessel_id: string; batch_id: string; batch_no: number | null; brand_name: string | null; bbl: number };

export default async function VesselPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "upsert_vessel", "Vessel detail");
  if (id === "new") return <VesselForm model={{ title: "New vessel", backHref: "/cellar", name: "", type: "Fermenter", typeOptions: VESSEL_TYPES, capacity: "", currentReading: "No readings yet", history: [] }} />;
  const [vessels, occupancies, unit] = await Promise.all([
    runPageQuery("list_vessels", {}, ctx), runPageQuery("list_occupancies", {}, ctx), runPageQuery("get_gravity_unit", {}, ctx),
  ]) as [Vessel[], Occupancy[], { effective: GravityUnit }];
  const vessel = vessels.find(vessel => vessel.id === id);
  if (!vessel) notFound();
  const occupancy = occupancies.find(occupancy => occupancy.vessel_id === id);
  const readings = occupancy ? await runPageQuery("list_fermentation_readings", { occupancyId: occupancy.occupancy_id }, ctx) as VesselReading[] : [];
  return <VesselForm key={id} vesselId={id} model={{
    title: vessel.name, backHref: "/cellar", name: vessel.name, type: vessel.kind[0].toUpperCase() + vessel.kind.slice(1), typeOptions: VESSEL_TYPES, capacity: String(vessel.capacity_bbl),
    occupancy: occupancy ? { title: `${occupancy.brand_name ?? "No brand yet"} · ${batNo(occupancy.batch_no)}`, detail: `${occupancy.bbl} / ${vessel.capacity_bbl} bbl`, verb: "Open batch", href: `/batches/${occupancy.batch_id}` } : undefined,
    readingHref: occupancy ? `/cellar/${occupancy.occupancy_id}/reading` : undefined,
    currentReading: readings[0] ? `${formatVesselReading(readings[0], unit.effective)} · ${readings[0].at}` : "No readings yet",
    history: readings.map(reading => ({ key: reading.id, title: reading.at, detail: formatVesselReading(reading, unit.effective) })),
  }} />;
}

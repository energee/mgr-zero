export type CellarMapViewModel = {
  backHref?: string; addHref?: string; readingHref?: string | null; brewHref?: string;
  tiles: { name: string; detail: string; reading?: string; warning?: boolean; fill?: number; href?: string }[];
  detail?: { title: string; description: string; href?: string };
};

export function toCellarMapViewProps(vessels: { id: string; name: string; capacity_bbl: number }[], occupancies: { vessel_id: string; occupancy_id: string; brand_name: string | null; bbl: number }[], readings: Record<string, string> = {}, hrefs: Record<string, string> = {}): CellarMapViewModel {
  return { tiles: vessels.map(vessel => {
    const occupancy = occupancies.find(item => item.vessel_id === vessel.id);
    const quantity = occupancy ? Number(occupancy.bbl) : 0;
    const capacity = Number(vessel.capacity_bbl);
    return { name: vessel.name, detail: `${occupancy ? occupancy.brand_name ?? "No brand yet" : "Empty"} · ${quantity} / ${capacity} bbl`, reading: occupancy ? readings[occupancy.occupancy_id] ?? "No readings yet" : "available", fill: capacity > 0 ? quantity / capacity * 100 : undefined, href: hrefs[vessel.id] };
  }) };
}

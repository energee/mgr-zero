// lib/mgr/vessel-detail-view.ts — view-model for Vessel detail (inventory).
export type VesselDetailViewModel = {
  backHref?: string;
  title: string;
  occupancy: { title: string; detail: string; verb: string; warning?: boolean };
  currentReading: string;
  history: { key: string; title: string; detail: string; who: string }[];
  name: string;
  type: string;
  typeOptions: string[];
  capacity: string;
};

export function toVesselDetailViewProps(s: VesselDetailViewModel): VesselDetailViewModel {
  return s;
}

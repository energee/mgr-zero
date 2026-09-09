import type { MonthlyComplianceSnapshot } from "@/lib/mgr/monthly-compliance-view";

export const monthlyComplianceAugust: MonthlyComplianceSnapshot = {
  monthLabel: "August 2026",
  losses: [{
    adjustment_id: "loss-1042", batch_id: "batch-1042", batch_no: 1042, closed_at: "2026-08-31",
    original_bbl: "0.05741935", remaining_bbl: "0.03741935",
    allocations: [{ id: "allocation-1", bbl: "0.02000000", classification: "sample", destination_state: "PA", tax_treatment: null, created_at: "2026-08-31", created_by: "user-1" }],
  }],
  report: {
    figures: {
      jurisdiction: "TTB", periodStart: "2026-08-01", periodEnd: "2026-08-31", balances: true,
      lines: [
        { class: "keg", begin: 41, in: 30.5, out: 33.2, end: 38.3 },
        { class: "can", begin: 12.6, in: 18, out: 14.9, end: 15.7 },
        { class: "bottle", begin: 0, in: 0, out: 0, end: 0 },
      ],
      inProcess: 120.4, packaged: 48.5,
      removals: { taxable: 41.2, export: 6.9, loss: 0.05741935 },
      cellarRemovals: { loss: 0.05741935 },
      byState: { PA: 38.1, OH: 3.1 },
    },
    warnings: [],
    externalMappingRequired: [],
  },
};

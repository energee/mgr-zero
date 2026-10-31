import type { MonthlyComplianceSnapshot } from "@/lib/mgr/monthly-compliance-view";
import { basisCorrectionDemo, DEMO_TIME_ZONE } from "./settings";

export const monthlyComplianceAugust: MonthlyComplianceSnapshot = {
  monthLabel: "August 2026",
  timeZone: DEMO_TIME_ZONE,
  today: "2026-09-15",
  losses: [{
    adjustment_id: "loss-1042", batch_id: "batch-1042", batch_no: 1042, closed_at: "2026-08-31", kind: "completion",
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
      inProcess: 120.4, inProcessAsOf: "2026-08-31", packaged: 48.5,
      removals: { taxable: 41.2, export: 6.9, loss: 0.05741935 },
      cellarRemovals: { loss: 0.05741935 },
      stateTransactions: [
        { state: "PA", kind: "sale_removal", eventDate: "2026-08-15", sourceId: "shipment-PA", originalSourceId: null, volumeBbl: 38.1, salesCents: 0, sourceStatus: "posted" },
        { state: "OH", kind: "sale_removal", eventDate: "2026-08-16", sourceId: "shipment-OH", originalSourceId: null, volumeBbl: 3.1, salesCents: 0, sourceStatus: "posted" },
        { state: "PA", kind: "invoice", eventDate: "2026-08-15", sourceId: "invoice-PA", originalSourceId: null, volumeBbl: 0, salesCents: 2460000, sourceStatus: "live" },
      ],
      byState: { PA: 38.1, OH: 3.1 },
    },
    warnings: [],
  },
};

/** The period still running (#579): reviewable from the ledger, not fileable yet. */
export const monthlyComplianceSeptember: MonthlyComplianceSnapshot = {
  ...monthlyComplianceAugust,
  monthLabel: "September 2026",
  losses: [],
  report: { ...monthlyComplianceAugust.report, figures: { ...monthlyComplianceAugust.report.figures, periodStart: "2026-09-01", periodEnd: "2026-09-30", inProcessAsOf: undefined } },
};

/** August that does not balance (#1143), so Save is withheld. Its warnings are
 *  written as generate_compliance_report writes them: kegs do not balance, an
 *  unclassified keg_swap movement, and the Unassigned note. */
export const monthlyComplianceUnbalanced: MonthlyComplianceSnapshot = {
  ...monthlyComplianceAugust,
  report: {
    figures: {
      ...monthlyComplianceAugust.report.figures, balances: false,
      stateTransactions: [...monthlyComplianceAugust.report.figures.stateTransactions!,
        { state: "Unassigned", kind: "sale_removal", eventDate: "2026-08-20", sourceId: "shipment-unassigned", originalSourceId: null, volumeBbl: 0.5, salesCents: 0, sourceStatus: "posted" }],
    },
    warnings: [
      "keg does not balance",
      "unclassified movement type keg_swap",
      "Some supporting facts have no recorded destination. Review Unassigned; MGR does not infer a state.",
    ],
  },
};

/** Original filed figures beside the immutable correction evidence. */
export const monthlyComplianceAmended: MonthlyComplianceSnapshot = {
  ...monthlyComplianceAugust,
  filing: {
    id: "filing-august", jurisdiction: "TTB", period_start: "2026-08-01", period_end: "2026-08-31",
    figures: monthlyComplianceAugust.report.figures, filed_at: "2026-09-02T14:00:00Z",
    filed_by: basisCorrectionDemo.corrected_by, created_at: "2026-09-02T14:00:00Z", note: null,
    needs_amendment: true,
    basis_amendments: [{
      filing_id: "filing-august", correction_id: basisCorrectionDemo.id, correction: basisCorrectionDemo,
      old_figures: monthlyComplianceAugust.report.figures,
      new_figures: { ...monthlyComplianceAugust.report.figures, lines: monthlyComplianceAugust.report.figures.lines.map(line => line.class === "can" ? { ...line, begin: 14.6, end: 17.7 } : line) },
    }],
  },
};

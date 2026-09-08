// lib/mgr/doc-no.ts — document labels for the per-brewery counters in
// brewery_counters (order, invoice, transfer, …). The pad width is a document
// convention, so it lives here rather than in each page that prints one.
export const docNo = (prefix: string, n: number | null, fallback: string) =>
  n ? `${prefix}-${String(n).padStart(4, "0")}` : fallback;

export const trfNo = (n: number | null) => docNo("TRF", n, "Transfer");
export const batNo = (n: number | null) => docNo("B", n, "Batch");
export const runNo = (n: number | null) => docNo("RUN", n, "Run");
export const poNo = (n: number | null) => docNo("PO", n, "Purchase order");

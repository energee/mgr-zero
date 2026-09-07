// app/(app)/transfers/trf-no.ts — the document label for a stock transfer.
export const trfNo = (n: number | null) => (n ? `TRF-${String(n).padStart(4, "0")}` : "Transfer");

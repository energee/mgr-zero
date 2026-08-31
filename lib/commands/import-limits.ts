// lib/commands/import-limits.ts — the one place the CSV batch cap is defined.
// The server rejects a request over this many rows; the import client chunks
// larger files into batches of exactly this size. Kept dependency-free so
// the client bundle can import it without pulling in server modules.
export const IMPORT_ROW_CAP = 5000;

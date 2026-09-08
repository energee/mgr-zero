type FormatShape = { id: string; basis: string; bbl_per_unit: string | number | null; composed: boolean };

export function eligibleChildren<T extends FormatShape>(parentId: string, formats: T[]): T[] {
  return formats.filter((f) => f.id !== parentId && f.basis === "packaged" && f.bbl_per_unit !== null && !f.composed);
}

export function canComposeFormat(format: Pick<FormatShape, "basis" | "bbl_per_unit">, usedAsChild: boolean) {
  return format.basis === "packaged" && format.bbl_per_unit === null && !usedAsChild;
}

export function validFormatRows(rows: { id: string; qty: string }[], allowedIds: string[], confirmClear: boolean) {
  return rows.length === 0 ? confirmClear : new Set(rows.map((r) => r.id)).size === rows.length
    && rows.every((r) => allowedIds.includes(r.id) && r.qty.trim() !== "" && Number.isFinite(Number(r.qty)) && Number(r.qty) > 0);
}

// lib/mgr/upc.ts — the one UPC rule (#1498): a UPC/EAN/GTIN barcode of 8, 12,
// 13 or 14 digits, or blank to clear it. The create_sku / update_sku /
// set_price_group_barcode schemas (UPC_PATTERN, kept a regex so the command's
// JSON schema still states it) and the Edit SKU and Save UPC sheets (upcError)
// share it, so a form and an HTTP caller are refused with the same sentence.
// Pure: safe for commands and views alike.
export const UPC_PATTERN = /^(\d{8}|\d{12,14})?$/;
export const UPC_MESSAGE = "Enter a UPC of 8, 12, 13 or 14 digits, or leave it blank.";

/** The submitReason item for a bad UPC. */
export const UPC_NEED = "a UPC of 8, 12, 13 or 14 digits";

/** Why `value` is not a UPC, or undefined when it is one or is blank. */
export function upcError(value: string): string | undefined {
  return UPC_PATTERN.test(value.trim()) ? undefined : UPC_MESSAGE;
}

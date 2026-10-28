// lib/mgr/new-transfer-view.ts — view-model for the New transfer sheet, and
// what its Create transfer still needs. Lines follow the order-line rules
// (lib/order-form-rules.ts): a wholly blank spare row is ignored, and any other
// row needs a SKU and a quantity above zero.
import { submitReason } from "@/lib/mgr/submit-reason";
import { isBlankLine, isCompleteLine, orderLineErrors } from "@/lib/order-form-rules";
// Live create stays new-transfer-form.tsx: E.pick / E.stq are not a controlled CommandForm.
/** sku is the picked option's value (the live form's SKU id); title is its label. */
export type NewTransferLineView = { sku?: string; title: string; qty: number | string };

export type NewTransferViewModel = {
  /** Where SKUs are made, for a user who may make one (create_sku). null when
   *  this user may not, so the empty note names who can; the inventory leaves
   *  it out and the link stays inert. */
  skusHref?: string | null;
  from: string;
  fromOptions: string[];
  fromBin: string;
  fromBinOptions: string[];
  to: string;
  toOptions: string[];
  toBin: string;
  toBinOptions: string[];
  /** SKU names are not unique, so the live form keys options by SKU id. */
  skuOptions: { value: string; label: string }[];
  lines: NewTransferLineView[];
};

export type NewTransferSnapshot = {
  from: string;
  fromOptions: string[];
  fromBin: string;
  fromBinOptions: string[];
  to: string;
  toOptions: string[];
  toBin: string;
  toBinOptions: string[];
  lines: NewTransferLineView[];
};

export function toNewTransferViewProps(s: NewTransferSnapshot): NewTransferViewModel {
  return { ...s, skuOptions: [...new Set(s.lines.map(line => line.title))].map(title => ({ value: title, label: title })) };
}

/** What Create transfer waits for: both locations, a bin at each, and every
 *  entered line sendable. The form picks a location's first bin itself, so a
 *  missing bin means the location has none: that is setup, named as such. */
export function newTransferReason(i: { fromId: string; toId: string; fromBinId: string; toBinId: string; lines: { skuId: string; qty: string }[] }): string | null {
  const missing: string[] = [];
  if (!i.fromId) missing.push("a From location");
  else if (!i.fromBinId) missing.push("a From location that has a bin");
  if (!i.toId) missing.push("a To location");
  else if (i.toId === i.fromId) missing.push("a To location other than the From location");
  else if (!i.toBinId) missing.push("a To location that has a bin");
  if (!i.lines.some(isCompleteLine) || orderLineErrors(i.lines).length > 0) missing.push("a SKU with a quantity above zero on each line");
  return submitReason(missing);
}

/** create_stock_transfer's lines. Only a wholly blank spare row is left out:
 *  an entered line is never dropped, so one that cannot be sent is refused
 *  with the rest (newTransferReason withholds the button first). */
export function transferPayloadLines(lines: { skuId: string; qty: string }[], fromBinId: string, toBinId: string) {
  return lines.filter((l) => !isBlankLine(l)).map((l) => ({ skuId: l.skuId, qty: Number(l.qty), fromBinId, toBinId }));
}

/** The To location to preselect: the only location other than From, or ""
 *  when there are several to choose from. */
export function onlyOtherLocation(locations: { id: string }[], fromId: string): string {
  const others = locations.filter((l) => l.id !== fromId);
  return others.length === 1 ? others[0].id : "";
}

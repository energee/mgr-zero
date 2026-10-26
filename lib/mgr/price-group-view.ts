// lib/mgr/price-group-view.ts — view-model for one Price group row. Name,
// position and cost ceiling come from list_price_groups, barcodes from
// list_price_group_barcodes; the Prices line
// summarises list_channel_prices for that group. Without a groupId it is the
// same row before it exists (the create form): blank name, next position,
// under the last group's ceiling, no Prices line. priceGroupReason says what
// the sheet's Save still needs.
import { dollarsInput, money, toCents } from "./money";
import { plural } from "./plural";
import { submitReason } from "./submit-reason";
import { barcodeOf, byPosition, formatLabel, type PriceGroupRow, type PriceGroupsSnapshot } from "./price-groups-view";

export type PriceGroupViewModel = {
  backHref?: string;
  name: string;
  position: string;
  costCeilingInput: string;
  previousCeilingLabel?: string;
  previousCeiling?: string;
  /** Absent on a group that does not exist yet (the create form). */
  prices?: string;
  /** Absent on the create form, which has nothing to remove. */
  removeDetail?: string;
  /** Pours this group owns. Absent on the create form. */
  pours?: { id: string; name: string; ounces: string }[];
  /** The group's UPC per packaged format; "" when it has none, which is a finished state (spec D4). Absent on the create form. */
  barcodes?: { formatId: string; format: string; upc: string }[];
};

export type PriceGroupSnapshot = PriceGroupsSnapshot & { groupId?: string };

function pricesSummary(snapshot: PriceGroupsSnapshot, groupId: string): string {
  const priced = snapshot.cells.filter((c) => c.price_group_id === groupId);
  const first = priced[0];
  if (!first) return "none";
  const channel = snapshot.channels.find((c) => c.id === first.sale_channel_id)?.name ?? "";
  const format = snapshot.formats.find((f) => f.id === first.format_id);
  const head = `${money(first.unit_price_cents)} on ${channel} · ${format ? formatLabel(format) : ""}`;
  const rest = priced.length - 1;
  return rest > 0 ? `${head}, and ${plural(rest, "more cell")}` : head;
}

/** Map one list_price_groups row (or none, for the create form) plus its grid cells onto PriceGroupView. */
export function toPriceGroupViewProps(snapshot: PriceGroupSnapshot): PriceGroupViewModel {
  const ordered = [...snapshot.groups].sort(byPosition);
  const index = snapshot.groupId === undefined ? ordered.length : ordered.findIndex((g) => g.id === snapshot.groupId);
  const group: PriceGroupRow | undefined = ordered[index];
  if (snapshot.groupId !== undefined && !group) throw new Error("price group not found");
  const previous = ordered[index - 1];
  return {
    backHref: snapshot.backHref,
    name: group?.name ?? "",
    // Past the highest position, not count + 1: a removed group leaves a gap,
    // and positions are unique per brewery.
    position: String(group?.position ?? (ordered.at(-1)?.position ?? 0) + 1),
    costCeilingInput: dollarsInput(group?.cost_ceiling_cents),
    previousCeilingLabel: previous && `Cost ceiling · group ${previous.name}`,
    previousCeiling: previous && (previous.cost_ceiling_cents == null ? "none" : money(previous.cost_ceiling_cents)),
    ...(group && {
      prices: pricesSummary(snapshot, group.id),
      removeDetail: "refused while a brand sits on it, a cell prices it, or it owns a pour",
      pours: snapshot.formats.filter((f) => f.basis === "poured" && f.price_group_id === group.id).map((f) => ({
        id: f.id, name: f.name, ounces: f.ounces != null ? String(f.ounces) : "",
      })),
      barcodes: snapshot.formats.filter((f) => f.basis !== "poured").map((f) => ({
        formatId: f.id, format: formatLabel(f),
        upc: barcodeOf(snapshot.barcodes, group.id, f.id) ?? "",
      })),
    }),
  };
}

/** Match upsert_price_group: a positive integer position and nonnegative int cents. */
export function priceGroupFieldErrors(fields: Pick<PriceGroupViewModel, "position" | "costCeilingInput">): { position?: string; costCeiling?: string } {
  const position = Number(fields.position);
  const cost = Number(fields.costCeilingInput);
  let costCeiling: string | undefined;
  if (fields.costCeilingInput !== "") {
    if (/[eE]/.test(fields.costCeilingInput)) costCeiling = "Enter a decimal number without exponent notation.";
    else if (!Number.isFinite(cost) || cost < 0) costCeiling = "Enter a cost of zero or more.";
    else if (toCents(fields.costCeilingInput)! > 2_147_483_647) costCeiling = "Enter a cost no greater than $21,474,836.47.";
  }
  let positionError: string | undefined;
  if (/[eE]/.test(fields.position)) positionError = "Enter a decimal number without exponent notation.";
  else if (!Number.isInteger(position) || position < 1) positionError = "Enter a whole-number position of 1 or more.";
  else if (position > 2_147_483_647) positionError = "Enter a position no greater than 2,147,483,647.";
  return {
    ...(positionError ? { position: positionError } : {}),
    ...(costCeiling && { costCeiling }),
  };
}

export function priceGroupReason(fields: Pick<PriceGroupViewModel, "name" | "position" | "costCeilingInput">): string | null {
  const errors = priceGroupFieldErrors(fields);
  return submitReason([
    ...(!fields.name.trim() ? ["a group name"] : []),
    ...(errors.position ? ["a whole-number position from 1 to 2,147,483,647"] : []),
    ...(errors.costCeiling ? ["a valid cost ceiling"] : []),
  ]);
}

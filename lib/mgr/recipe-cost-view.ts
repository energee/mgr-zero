// lib/mgr/recipe-cost-view.ts — the recipe page's Ingredient cost, and the
// phrases the Brand page shares. The recipe editor reads what each material
// costs now (list_material_costs: its last purchase-order receipt cost, else
// its typed price) and recipeCostTable works the sheet's cost out from the
// lines as typed: one row per ingredient, the total, and a summary line that
// says which ingredients rest on a typed price and which are not in stock.
// Every amount on the page comes from that one function, so they agree.
import { money } from "./money";
import { plural } from "./plural";
import { batchAmount } from "./recipe-day-view";

// A recipe can miss a dozen ingredients; naming three keeps the line short.
const namesUpTo3 = (names: string[]) => names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");

/** "2 ingredients have no price yet: Citra, Mosaic" */
export const uncostedText = (names: string[]) => `${plural(names.length, "ingredient has", "ingredients have")} no price yet: ${namesUpTo3(names)}`;

/** "typed price, no receipt cost: Citra, Vienna" */
export const unreceivedText = (names: string[]) => `typed price, no receipt cost: ${namesUpTo3(names)}`;

/** One material's cost per base unit as list_material_costs returns it, keyed by material id for the editor. */
export type MaterialCost = { unitCostCents: number | null; fromReceipt: boolean; inStock: boolean };

/** list_material_costs rows as the editor's lookup by material id. */
export const toMaterialCosts = (rows: readonly { material_id: string; unit_cost_cents: number | null; from_receipt: boolean; in_stock: boolean }[]): Record<string, MaterialCost> =>
  Object.fromEntries(rows.map((row) => [row.material_id, { unitCostCents: row.unit_cost_cents, fromReceipt: row.from_receipt, inStock: row.in_stock }]));

/** The sheet's ingredient cost: what the Ingredient cost section on the recipe page draws. */
export type RecipeCostTable = {
  /** The fold line: the cost per barrel and for the batch, then the ingredients on a typed price and those not in
   *  stock. While an ingredient has no price the cost is the priced part, said as "at least". */
  summary: string;
  /** What Amount and Cost are for: "for 22 bbl", or "per bbl" when the recipe has no batch size. */
  basis: string;
  /** One row per ingredient, in the sheet's order. `price` is "" and `cost` reads "No price" when the material has
   *  neither a receipt cost nor a typed price. `note` says "typed price" and "none in stock" when they apply. */
  rows: { key: string; name: string; amount: string; price: string; cost: string; note: string }[];
  /** The priced rows' cost, the same amount the summary gives. `totalNote` says how many ingredients it leaves out, or "". */
  total: string;
  totalNote: string;
};

// Whole cents from a sum of amount × price. Six decimals first: a binary sum that should land on .5 must not round down.
const wholeCents = (cents: number) => Math.round(Number(cents.toFixed(6)));

// A price per base unit can be under a cent (hops counted in grams), so it shows up to four decimals.
const unitPrice = (cents: number, unit: string | undefined) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}${unit ? `/${unit}` : ""}`;

/** The cost of the sheet as typed, for a batch of `bbl` barrels (0 reads per barrel). A line with no material or
 *  amount yet is left out. An ingredient on several lines (a hop in the boil and the dry hop) is one row with its
 *  amounts summed. A material with no cost row counts as unpriced and out of stock, so no number is made up.
 *  Undefined when no line is ready. */
export function recipeCostTable(
  lines: readonly { materialId: string; perBblQty: string }[],
  costs: Readonly<Record<string, MaterialCost | undefined>>,
  material: { name: (materialId: string) => string; unit: (materialId: string) => string | undefined },
  bbl: number,
): RecipeCostTable | undefined {
  const perBbl = new Map<string, number>();
  for (const line of lines) {
    if (line.materialId !== "" && Number(line.perBblQty) > 0) perBbl.set(line.materialId, (perBbl.get(line.materialId) ?? 0) + Number(line.perBblQty));
  }
  if (!perBbl.size) return undefined;
  const scale = bbl > 0 ? bbl : 1;
  // Cents per barrel across the priced rows, unrounded: the barrel and the batch are each rounded once from it.
  let pricedPerBbl = 0;
  const unpriced: string[] = [], typed: string[] = [], outOfStock: string[] = [];
  const rows = [...perBbl].map(([id, qty]) => {
    const cost = costs[id], unit = material.unit(id), name = material.name(id), cents = cost?.unitCostCents ?? null;
    if (cents === null) unpriced.push(name); else pricedPerBbl += qty * cents;
    if (cents !== null && !cost?.fromReceipt) typed.push(name);
    if (!cost?.inStock) outOfStock.push(name);
    return {
      key: id, name, amount: `${batchAmount(qty * scale)}${unit ? ` ${unit}` : ""}`,
      price: cents === null ? "" : unitPrice(cents, unit),
      cost: cents === null ? "No price" : money(wholeCents(qty * scale * cents)),
      note: [cents !== null && !cost?.fromReceipt ? "typed price" : "", cost?.inStock ? "" : "none in stock"].filter(Boolean).join(" · "),
    };
  });
  const total = money(wholeCents(pricedPerBbl * scale));
  const amount = `${money(wholeCents(pricedPerBbl))}/bbl${bbl > 0 ? `, ${total} for ${bbl} bbl` : ""}`;
  const summary = [
    !unpriced.length ? `Ingredients cost ${amount}.`
      : unpriced.length < rows.length ? `Ingredients cost at least ${amount} · ${uncostedText(unpriced.sort())}.`
      : `Ingredient cost unknown · ${uncostedText(unpriced.sort())}.`,
    typed.length ? `Typed price, no receipt cost: ${namesUpTo3(typed.sort())}.` : "",
    outOfStock.length ? `None in stock: ${namesUpTo3(outOfStock.sort())}.` : "",
  ].filter(Boolean).join(" ");
  return {
    summary, basis: bbl > 0 ? `for ${bbl} bbl` : "per bbl", rows,
    total, totalNote: unpriced.length ? `without ${plural(unpriced.length, "unpriced ingredient", "unpriced ingredients")}` : "",
  };
}

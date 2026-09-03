// lib/volume.ts — the one place that turns a stored barrel figure into the
// unit a brewer reads (brewing-domain.md § units). Storage and TTB stay bbl.
export const GALLONS_PER_BBL = 31;
export const OUNCES_PER_BBL = 3_968;

/** Keg fractions shown as glyphs, by denominator. */
const FRACTIONS = [[2, "½"], [4, "¼"], [6, "⅙"], [8, "⅛"]] as const;
const closeTo = (value: number, target: number) => Math.abs(value - target) < 0.0001;
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });

/** Ounces describe containers, so they stop at a gallon: 0.75 bbl is a whole
 *  number of ounces (2,976) and no brewer reads it that way. */
const OUNCE_CEILING = OUNCES_PER_BBL / GALLONS_PER_BBL;

/** ≥1 bbl stays bbl; keg fractions use glyphs; smaller exact totals use whole gal, then oz; otherwise bbl.
 *  Anything that is not a finite number is a dash, never a real-looking "0 bbl". */
export function formatVolume(bbl: number | string) {
  const value = typeof bbl === "string" && bbl.trim() === "" ? NaN : Number(bbl);
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  return `${sign}${unsigned(Math.abs(value))}`;
}

function unsigned(amount: number) {
  if (amount === 0 || amount >= 1) return `${number.format(amount)} bbl`;
  for (const [d, glyph] of FRACTIONS) {
    if (closeTo(amount * d, 1)) return `${glyph} bbl`;
  }
  // `> 0` or a volume below the tolerance reads as "0 gal" instead of a real figure.
  const gallons = amount * GALLONS_PER_BBL;
  if (Math.round(gallons) > 0 && closeTo(gallons, Math.round(gallons))) return `${Math.round(gallons)} gal`;
  const ounces = amount * OUNCES_PER_BBL;
  if (Math.round(ounces) > 0 && ounces <= OUNCE_CEILING && closeTo(ounces, Math.round(ounces))) return `${Math.round(ounces)} oz`;
  return `${number.format(amount)} bbl`;
}

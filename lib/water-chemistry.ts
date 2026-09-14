// lib/water-chemistry.ts — the one water formula (spec
// 2026-09-14-water-salt-suggestions): what each brewing salt adds per gram
// per liter, the six-ion read-out of a version's water over its total
// brewing water, and the non-negative least-squares suggestion. Pure and
// registry-layer, like lib/recipe-gravity.ts: the editor preview and any
// server read call these; nothing here is ever stored.

export type Ions = { calcium: number; magnesium: number; sodium: number; sulfate: number; chloride: number; bicarbonate: number };
export const IONS = ["calcium", "magnesium", "sodium", "sulfate", "chloride", "bicarbonate"] as const satisfies readonly (keyof Ions)[];
export const ION_LABELS: Record<keyof Ions, string> = { calcium: "Calcium", magnesium: "Magnesium", sodium: "Sodium", sulfate: "Sulfate", chloride: "Chloride", bicarbonate: "Bicarbonate" };

export type Salt = "gypsum" | "calcium_chloride" | "epsom_salt" | "baking_soda" | "chalk" | "table_salt" | "magnesium_chloride";
export const SALTS: Salt[] = ["gypsum", "calcium_chloride", "epsom_salt", "baking_soda", "chalk", "table_salt", "magnesium_chloride"];
export const SALT_LABELS: Record<Salt, string> = {
  gypsum: "Gypsum", calcium_chloride: "Calcium chloride", epsom_salt: "Epsom salt", baking_soda: "Baking soda",
  chalk: "Chalk", table_salt: "Table salt", magnesium_chloride: "Magnesium chloride",
};
/** ppm added per gram of salt per liter of water. One place; correct it here only. */
export const SALT_PPM_PER_G_PER_L: Record<Salt, Partial<Ions>> = {
  gypsum: { calcium: 232.8, sulfate: 557.7 },
  calcium_chloride: { calcium: 272.6, chloride: 482.3 },
  epsom_salt: { magnesium: 98.6, sulfate: 389.6 },
  baking_soda: { sodium: 273.7, bicarbonate: 726.3 },
  chalk: { calcium: 400.5, bicarbonate: 1219.7 },
  table_salt: { sodium: 393.4, chloride: 606.6 },
  magnesium_chloride: { magnesium: 119.5, chloride: 348.7 },
};

export const GAL_TO_L = 3.78541;
export const OZ_TO_G = 28.3495;
/** Grams from an addition's qty and unit; mL is treated as grams (acids, which the solver never touches). */
export const gramsOf = (qty: number, unit: string) => (unit === "oz" ? qty * OZ_TO_G : qty);

export type IonRow = { ion: keyof Ions; source: number; added: number; result: number; target?: number; delta?: number };

const liters = (mashGal: number, spargeGal: number) => {
  if (mashGal < 0 || spargeGal < 0) throw new Error("water volume cannot be negative");
  return (mashGal + spargeGal) * GAL_TO_L;
};

/** Where every ion lands: source plus what the additions add over total brewing water, against the target when there is one. */
export function waterChemistry({ source, target, mashGal, spargeGal, additions }: {
  source: Ions; target?: Ions; mashGal: number; spargeGal: number; additions: { salt: Salt | null | undefined; grams: number }[];
}): IonRow[] {
  const L = liters(mashGal, spargeGal);
  if (L === 0) return [];
  return IONS.map((ion) => {
    const added = additions.reduce((sum, a) => sum + (a.salt ? (SALT_PPM_PER_G_PER_L[a.salt][ion] ?? 0) * a.grams / L : 0), 0);
    const result = source[ion] + added;
    return { ion, source: source[ion], added, result, target: target?.[ion], delta: target ? result - target[ion] : undefined };
  });
}

export function suggestSalts(_input: { source: Ions; target: Ions; totalGal: number; salts: Salt[] }): { salt: Salt; grams: number }[] {
  return [];
}

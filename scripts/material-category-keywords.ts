// scripts/material-category-keywords.ts — a free keyword lookup for a material's kind, the baseline the material kind
// experiment compares Jev against. Experiment-only: product code does not import it.
import type { MATERIAL_CATEGORIES } from "../lib/mgr/enums";

type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

/** Checked in order; the first list with a match wins. Packaging comes first so "IPA can label" is not read as a beer
 *  word, nutrients and enzymes come before yeast and malt words, and malt comes before hop and adjunct so
 *  "Honey malt" stays malt. Written from general brewing knowledge before the messy holdout existed, and not changed
 *  after any run; the first set and clean holdout had been read, so its scores there are optimistic. */
const RULES: [MaterialCategory, RegExp][] = [
  ["packaging", /\b(cans?|crowlers?|ends?|lids?|labels?|bottles?|crowns?|caps?|sleeves?|carriers?|pak ?tech|[46] ?pk|[46]-pack|cases?|trays?|cartons?|collars?|shrink|growlers?)\b/],
  ["chemical", /\b(nutrient|enzymes?|amylase|glucoamylase|clarex)\b/],
  ["malt", /\b(malts?|malted|pils(ner)?|[26]-row|maris otter|golden promise|vienna|munich|crys(tal)?|caramel|cara\w+|c-?\d{2,3}|chocolate|black patent|roasted barley|biscuit|victory|aromatic|melanoidin|special b|acidulated|dme|lme)\b/],
  ["hop", /\b(hops?|pellets?|cryo|lupulin|t-?90|t-?45|hash|citra|mosaic|simcoe|amarillo|cascade|centennial|chinook|columbus|ctz|galaxy|nelson|motueka|riwaka|sabro|strata|idaho ?7|el dorado|azacca|ekuanot|talus|nectaron|saaz|hallertau(er)?|tettnang(er)?|spalt|fuggle|goldings|ekg|styrian|magnum|warrior|apollo|summit|nugget|willamette|mt\.? hood|sterling|perle|northern brewer|saphir|mandarina|hersbrucker|wai-iti|vic secret|enigma|comet|loral|cashmere|zappa|krush)\b/],
  ["yeast", /\b(yeast|cultures?|strain|slurry|kveik|brett\w*|lacto|lactobacillus|pedio\w*|safale|saflager|safbrew|lalbrew|fermentis|nottingham|verdant|voss|us-?05|s-?0[34]|w-?34\/70|(wlp|wy|oyl|bry)-?\d{2,4})\b/],
  ["adjunct", /\b(flaked|torrified|rice|hulls|lactose|dextrose|sugar|candi|maltodextrin|honey|maple|molasses|syrup|puree|purée|juice|zest|peel|mango|passion ?fruit|raspberr(y|ies)|blackberr(y|ies)|blueberr(y|ies)|strawberr(y|ies)|cherr(y|ies)|peach|guava|pineapple|coconut|coffee|cacao|cocoa|nibs|vanilla|cinnamon|coriander|ginger|spices?|oak|spirals?|corn|maize|oats)\b/],
  ["chemical", /\b(gypsum|cacl2?|calcium|chloride|sulfate|epsom|salts?|acids?|phosphoric|lactic|whirlfloc|irish moss|biofine|silica|gelatin|isinglass|pvpp|polyclar|pbw|star ?san|iodophor|peracetic|paa|caustic|naoh|cleaner|sanitizer|detergent|defoamer|fermcap|campden|metabisulfite|zinc)\b/],
  ["other", /\b(co2|nitrogen|n2|glycol|gloves?|towels?|buffer|calibration|hydrometer|refractometer|sample|test kit|gaskets?|o-?rings?|tri-?clamp|filters?|hoses?|goggles|apron|boots)\b/],
];

/** The kind of the first keyword list that matches the name (case-insensitive), or null when none matches. */
export function keywordMaterialCategory(name: string): MaterialCategory | null {
  const text = name.toLowerCase();
  return RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

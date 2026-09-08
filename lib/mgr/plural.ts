// lib/mgr/plural.ts — "1 shortage" / "2 shortages". Every list row that prints a
// count and its noun reads it from here, so no call site gets the branch
// backwards. `many` covers the nouns an -s does not (box, boxes).
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

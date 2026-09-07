// lib/mgr/api-schema.ts — reads a registered operation's Zod input schema well
// enough to document it: the field table and the example request body on every
// /docs/api page come from here, so an operation's docs cannot describe input
// its handler does not accept. Zod's internals are untyped by design, hence the
// `any` walk; everything this reads (def.type, def.shape, def.checks, def.entries)
// is covered by tests/api-docs.test.ts against the real registry.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ZodType } from "zod";

export type ApiField = { name: string; type: string; required: boolean };

/** The format a string or number check pins down: "uuid", "date", "safeint", … */
const formats = (node: any): string[] =>
  (node.def.checks ?? []).map((c: any) => c._zod?.def?.format ?? c._zod?.def?.check).filter(Boolean);

// Wrappers that change how a field may be omitted or emptied but not its shape.
// They nest — `z.object({…}).nullable().optional()` is optional→nullable→object,
// and `z.number().int().default(50)` is default→number — so both the label and
// the required flag have to walk the whole chain. Stopping at one level printed
// the wrapper's own name as the type ("default", "nullable") in the field table.
const WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "readonly", "catch"]);

/** The schema node under every wrapper: the type a caller actually sends. */
const unwrapOptional = (node: any) => {
  let inner = node;
  while (inner?.def && WRAPPERS.has(inner.def.type) && inner.def.innerType) inner = inner.def.innerType;
  return inner;
};

/** True when the field may be left out: some wrapper omits it or supplies a value. */
export function isOptional(node: any): boolean {
  for (let n = node; n?.def && WRAPPERS.has(n.def.type); n = n.def.innerType) {
    if (n.def.type === "optional" || n.def.type === "default" || n.def.type === "prefault") return true;
    if (!n.def.innerType) break;
  }
  return false;
}

/** A human type label for one schema node, e.g. `uuid`, `integer`, `keg | can`. */
export function typeLabel(node: any): string {
  const inner = unwrapOptional(node);
  const format = formats(inner);
  switch (inner.def.type) {
    case "string":
      if (format.includes("uuid")) return "uuid";
      if (format.includes("date")) return "date (YYYY-MM-DD)";
      if (format.includes("length_equals")) return "string, fixed length";
      return "string";
    case "number":
      return format.includes("safeint") || format.includes("int") ? "integer" : "number";
    case "boolean": return "boolean";
    case "enum": return Object.keys(inner.def.entries ?? {}).join(" or ");
    case "array": return `array of ${typeLabel(inner.def.element)}`;
    case "object": return "object";
    default: return inner.def.type ?? "unknown";
  }
}

/** A placeholder value of the right shape, for the example request body. */
export function sampleValue(node: any): unknown {
  const inner = unwrapOptional(node);
  const format = formats(inner);
  switch (inner.def.type) {
    case "string":
      if (format.includes("uuid")) return "00000000-0000-0000-0000-000000000000";
      if (format.includes("date")) return "2026-01-31";
      if (format.includes("length_equals")) return "CA";
      return "string";
    case "number": return 1;
    case "boolean": return true;
    case "enum": return Object.keys(inner.def.entries ?? {})[0];
    case "array": return [sampleValue(inner.def.element)];
    case "object": return sampleInput(inner);
    default: return null;
  }
}

/** Top-level fields of an operation's input, required ones first. */
export function fieldsOf(schema: ZodType): ApiField[] {
  const shape = (schema as any).def?.shape;
  if (!shape) return [];
  return Object.entries<any>(shape)
    .map(([name, node]) => ({ name, type: typeLabel(node), required: !isOptional(node) }))
    .sort((a, b) => (a.required === b.required ? 0 : a.required ? -1 : 1));
}

/** An example `input` object: every required field, no optional ones. */
export function sampleInput(schema: ZodType): Record<string, unknown> {
  const shape = (schema as any).def?.shape;
  if (!shape) return {};
  const sample: Record<string, unknown> = {};
  for (const [name, node] of Object.entries<any>(shape)) {
    if (isOptional(node)) continue;
    sample[name] = sampleValue(node);
  }
  return sample;
}

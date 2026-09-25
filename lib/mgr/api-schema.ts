// lib/mgr/api-schema.ts — reads a registered operation's Zod input schema well
// enough to document it: the field table and the example request body on every
// /docs/api page come from here, so an operation's docs cannot describe input
// its handler does not accept. Use Zod's core discriminated schema definitions.
import { core } from "zod";
import type { $ZodType, $ZodTypes } from "zod/v4/core";

// Zod documents this union cast for schema walkers; each definition is then
// narrowed by its type discriminator before accessing type-specific fields.
const definition = (node: $ZodType) => (node as $ZodTypes)._zod.def;

export type ApiField = { name: string; type: string; required: boolean };

/** The format a string or number check pins down: "uuid", "date", "safeint", … */
const formats = (node: $ZodType): string[] =>
  (node._zod.def.checks ?? []).map(c => {
    const def = c._zod.def;
    return "format" in def && typeof def.format === "string" ? def.format : def.check;
  });

// Wrappers that change how a field may be omitted or emptied but not its shape.
// They nest — `z.object({…}).nullable().optional()` is optional→nullable→object,
// and `z.number().int().default(50)` is default→number — so both the label and
// the required flag have to walk the whole chain. Stopping at one level printed
// the wrapper's own name as the type ("default", "nullable") in the field table.
/** The schema node under every wrapper: the type a caller actually sends. */
const unwrapOptional = (node: $ZodType): $ZodType => {
  const def = definition(node);
  switch (def.type) {
    case "optional": case "nullable": case "default": case "prefault": case "readonly": case "catch":
      return unwrapOptional(def.innerType);
    default: return node;
  }
};

/** True when the field may be left out or supplies its own value. */
export const isOptional = (node: $ZodType) => core.safeParse(node, undefined).success;

/** True when `null` is an accepted value, at any depth of the wrapper chain. */
export const isNullable = (node: $ZodType) => core.safeParse(node, null).success;

/** A human type label for one schema node, e.g. `uuid`, `integer`, `keg or can`.
 * Members join with " or ", not "|" — the label lands inside a Markdown table
 * cell, where a bare pipe would break the row. A nullable field says so: `null`
 * can be the documented way to use it (set_brewery_quiet_hours clears its
 * quiet hours that way), and unwrapping `nullable` silently left the table
 * reading `string` / Required `yes`, with nothing to suggest otherwise. */
export function typeLabel(node: $ZodType): string {
  return isNullable(node) ? `${baseLabel(node)} or null` : baseLabel(node);
}

function baseLabel(node: $ZodType): string {
  const inner = unwrapOptional(node);
  const format = formats(inner);
  const def = definition(inner);
  switch (def.type) {
    case "string":
      if (format.includes("uuid")) return "uuid";
      if (format.includes("date")) return "date (YYYY-MM-DD)";
      if (format.includes("length_equals")) return "string, fixed length";
      return "string";
    case "number":
      return format.includes("safeint") || format.includes("int") ? "integer" : "number";
    case "boolean": return "boolean";
    case "literal": return def.values.map(String).join(" or ");
    case "union": return def.options.map(typeLabel).join(" or ");
    case "enum": return Object.keys(def.entries ?? {}).join(" or ");
    case "array": return `array of ${typeLabel(def.element)}`;
    case "object": return "object";
    case "record": return `record of ${typeLabel(def.valueType)}`;
    default: return def.type ?? "unknown";
  }
}

// A guess is only useful if the field's own validator accepts it — sniffing a
// fixed set of named formats (uuid, date, …) silently fell back to the
// literal "string" for anything else, so a schema with an email, a state-code
// regex, an HH:MM check or a numeric string documented an example its own
// handler rejected (2026-09-06 review). These are tried in order and the
// first one the node's own `safeParse` accepts wins; none has to be "the"
// answer for every field, only for whichever this one turns out to be. The
// plain word goes first: an unconstrained field (`z.string().min(1)`) would
// otherwise show whichever format-looking candidate happens to satisfy it
// too — a UUID in a field that takes any string is a false hint about its
// shape. Only a field that actually rejects "string" falls through to a
// format that might fit it.
const STRING_CANDIDATES = [
  "string", "00000000-0000-0000-0000-000000000000", "2026-01-31", "CA",
  "user@example.com", "openai/gpt-5.4", "12:00", "2026-01-31T12:00:00Z", "1", "1.0",
  "19107", "012345678905", "(503) 555-0142",
];
const NUMBER_CANDIDATES = [1, 1.5, 0];

/** A placeholder value of the right shape, for the example request body. */
export function sampleValue(node: $ZodType): unknown {
  const inner = unwrapOptional(node);
  const def = definition(inner);
  switch (def.type) {
    case "string": {
      const fit = STRING_CANDIDATES.find((c) => core.safeParse(inner, c).success);
      if (fit === undefined) throw new Error(`api-schema: no sample string satisfies this field's checks (${JSON.stringify(formats(inner))})`);
      return fit;
    }
    case "number": {
      // A bounded field (a reading's 25–212 °F) falls back to its own minimum.
      const { minimum } = inner._zod.bag as { minimum?: number };
      const fit = [...NUMBER_CANDIDATES, minimum].find((c) => c !== undefined && core.safeParse(inner, c).success);
      if (fit === undefined) throw new Error("api-schema: no sample number satisfies this field's checks");
      return fit;
    }
    case "boolean": return true;
    case "literal": return def.values[0];
    case "union": return sampleValue(def.options[0]);
    case "enum": return Object.keys(def.entries ?? {})[0];
    case "array": return [sampleValue(def.element)];
    case "object": return sampleInput(inner);
    case "record": return { field: sampleValue(def.valueType) };
    // An unhandled node type would otherwise become `null` in the example —
    // valid-looking JSON that fails the field's own schema. Fail at
    // generation time instead, where it is a one-line stack trace, not a
    // shipped example nobody re-validates.
    default: throw new Error(`api-schema: sampleValue has no case for zod type "${def.type}"`);
  }
}

/** Top-level fields of an operation's input, required ones first. */
export function fieldsOf(schema: $ZodType): ApiField[] {
  const def = definition(schema);
  const options = def.type === "union" ? def.options : undefined;
  if (options) {
    const fields = options.map(fieldsOf);
    return [...new Map(fields.flat().map(field => [field.name, { ...field,
      required: fields.every(option => option.some(f => f.name === field.name && f.required)),
    }])).values()];
  }
  const shape = def.type === "object" ? def.shape : undefined;
  if (!shape) return [];
  return Object.entries(shape)
    .map(([name, node]) => ({ name, type: typeLabel(node), required: !isOptional(node) }))
    .sort((a, b) => (a.required === b.required ? 0 : a.required ? -1 : 1));
}

/** An example input: required fields, plus one optional field when a cross-field rule requires it. */
export function sampleInput(schema: $ZodType): Record<string, unknown> {
  const def = definition(schema);
  const options = def.type === "union" ? def.options : undefined;
  if (options) return sampleInput(options[0]);
  const shape = def.type === "object" ? def.shape : undefined;
  if (!shape) return {};
  const sample: Record<string, unknown> = {};
  for (const [name, node] of Object.entries(shape)) {
    if (isOptional(node)) continue;
    sample[name] = sampleValue(node);
  }
  if (!core.safeParse(schema, sample).success) {
    for (const [name, node] of Object.entries(shape)) {
      if (!isOptional(node)) continue;
      const candidate = { ...sample, [name]: sampleValue(node) };
      if (core.safeParse(schema, candidate).success) return candidate;
    }
  }
  return sample;
}

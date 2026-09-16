import { z } from "zod";

// Normalize provider payloads exactly as the HTTP JSON transport does before
// passing them to a typed JSONB argument. Validation prevents untyped escape.
export function toJson(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Expected a JSON value");
  const parsed: unknown = JSON.parse(serialized);
  return z.json().parse(parsed);
}

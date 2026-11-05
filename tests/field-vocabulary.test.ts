// tests/field-vocabulary.test.ts — keeps lib/mgr/field-vocabulary.ts true to the
// registry: every entry says something, every entity is a known record kind, no
// entry outlives its input field, and no input field goes without a meaning.
import { describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { listTools } from "@/lib/commands/registry";
import { SEARCH_KINDS } from "@/lib/commands/search";
import { isIdField } from "@/lib/mgr/agent-readiness";
import { leafFields } from "@/lib/mgr/api-schema";
import { FIELD_VOCABULARY } from "@/lib/mgr/field-vocabulary";

// Search already names 20 record kinds, so an id field reuses those names.
// These are the record kinds search does not cover. Add one only for a new kind.
const ENTITIES = new Set<string>([
  ...SEARCH_KINDS,
  "allocation", "brand", "chat_channel", "chat_conversation", "chat_installation", "chat_link",
  "delivery", "format", "invitation", "invoice_line", "invoice_payment", "invoice_question",
  "location", "material_contract", "movement", "notification_destination", "occupancy", "order_line",
  "po_line", "pos_item", "pos_location", "pos_sale", "pos_variation", "price_group",
  "qbo_account", "qbo_customer", "qbo_item", "qbo_vendor", "quote", "receipt",
  "recipe_ingredient", "recipe_version", "sale_channel", "shipment", "tap_interval", "taproom_count",
  "user", "volume_adjustment",
]);

const entries = Object.entries(FIELD_VOCABULARY);
const inputs = listTools().flatMap(tool => leafFields(tool.inputSchema));

describe("FIELD_VOCABULARY", () => {
  it("gives every entry a meaning", () => {
    expect(entries.filter(([, entry]) => !entry.meaning.trim()).map(([name]) => name)).toEqual([]);
  });

  it("names only known record kinds", () => {
    expect(entries.filter(([, entry]) => entry.entity && !ENTITIES.has(entry.entity)).map(([name]) => name)).toEqual([]);
  });

  it("names the record kind of every id field", () => {
    expect(entries.filter(([name, entry]) => isIdField(name) && !entry.entity).map(([name]) => name)).toEqual([]);
  });

  it("holds no entry for a field the registry no longer has", () => {
    const inputFields = new Set(inputs.map(field => field.name));
    expect(entries.map(([name]) => name).filter(name => !inputFields.has(name))).toEqual([]);
  });

  // The readiness floor cannot catch this: a new unexplained field leaves the count where it was.
  it("leaves no input field without a meaning", () => {
    expect(inputs.filter(field => !field.described && !Object.hasOwn(FIELD_VOCABULARY, field.name)).map(field => field.name)).toEqual([]);
  });
});

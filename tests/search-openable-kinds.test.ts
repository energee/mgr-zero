// tests/search-openable-kinds.test.ts — search_entities only returns hits a
// role can open (#478). Each kind's href is a page whose registry reads decide
// access; a kind whose page would send the role to No access is not searched.
// Pure: canRun reads registration metadata, never Postgres.
import { describe, expect, it } from "vitest";
import type { Ctx, StaffRole } from "../lib/commands/registry";
import { openableKinds, SEARCH_KINDS } from "../lib/commands/search";
import "../lib/commands/all";

const ctxFor = (role: StaffRole) => ({ breweryId: "11111111-1111-4111-8111-111111111111", role, userId: "22222222-2222-4222-8222-222222222222" } as unknown as Ctx);

describe("openableKinds", () => {
  it("admin searches every kind", () => {
    expect(openableKinds(ctxFor("admin"), [...SEARCH_KINDS])).toEqual([...SEARCH_KINDS]);
  });
  it("brewer only searches what brewer pages open", () => {
    expect(openableKinds(ctxFor("brewer"), [...SEARCH_KINDS])).toEqual(["batch"]);
  });
  it("warehouse cannot open lot traces or batches", () => {
    expect(openableKinds(ctxFor("warehouse"), [...SEARCH_KINDS])).toEqual(["sku", "order", "invoice", "customer", "po"]);
  });
  it("sales cannot open purchase orders or batches", () => {
    expect(openableKinds(ctxFor("sales"), [...SEARCH_KINDS])).toEqual(["sku", "order", "invoice", "lot", "customer"]);
  });
});

// tests/agent-eval-seed.test.ts — proves the eval seed answers its read cases: each value a
// case expects comes back from a real query, run as that case's role.
import { beforeAll, describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import { evalCaseSchema } from "@/lib/mgr/agent-eval-score";
import fixture from "./fixtures/agent-evals.json";
import { seedEvalBrewery } from "./agent-eval-seed";
import { asUser } from "./helpers";

type Seed = Awaited<ReturnType<typeof seedEvalBrewery>>;
const cases = evalCaseSchema.array().parse(fixture);

/** The query that answers each fact case, and how the value looks in its raw result. */
const ANSWERS: Record<string, { query: string; input?: (seed: Seed) => Record<string, unknown>; raw: (string | number)[] }> = {
  "read-unpaid-balance": { query: "list_invoices", raw: ["Ridgeline Tap Room", 184000] },
  "read-on-hand": { query: "get_on_hand", raw: [48] },
  "read-tank-contents": { query: "list_fermentation_readings", input: seed => ({ occupancyId: seed.occupancyId }), raw: [3.2] },
  "read-open-purchase-orders": { query: "list_purchase_orders", raw: [1042] },
  "read-customers": { query: "list_customers", raw: ["Harbor Bottle Shop", "Mill Street Pub"] },
  "read-vendors": { query: "list_vendors", raw: ["Great Western Malting", "Crown Cans"] },
  "read-locations": { query: "list_locations", raw: ["Cold Store"] },
  "read-vessel-size": { query: "list_vessels", raw: ["BBT1", 20] },
  "read-fermenters": { query: "list_vessels", raw: ["FV1", "FV2"] },
  "read-skus": { query: "list_skus", raw: ["Hazy IPA 16 oz"] },
  "read-on-hand-hazy": { query: "get_on_hand", raw: [12] },
  "read-on-hand-cold": { query: "get_on_hand", raw: [7] },
  "read-harbor-balance": { query: "list_invoices", raw: ["Harbor Bottle Shop", 52500] },
  "read-biggest-balance": { query: "list_invoices", raw: ["Ridgeline Tap Room"] },
  "read-bins": { query: "list_bins", input: seed => ({ locationId: seed.mainId }), raw: ["Walk-in"] },
  "read-open-po-vendor": { query: "list_purchase_orders", raw: ["Yakima Valley Hops"] },
  "read-last-gravity": { query: "list_fermentation_readings", input: seed => ({ occupancyId: seed.occupancyId }), raw: [3.2] },
  "read-brands": { query: "list_brands", raw: ["Hazy IPA", "Pils"] },
};

describe("agent eval seed", () => {
  let seed: Seed;
  beforeAll(async () => { seed = await seedEvalBrewery(); });

  it("has an answer for every read case with facts", () => {
    const factCases = cases.filter(item => item.kind === "read" && "facts" in item.expectation).map(item => item.id);
    expect(Object.keys(ANSWERS).sort()).toEqual(factCases.sort());
  });

  it("reaches 50 cases, the O1 target", () => {
    expect(cases).toHaveLength(50);
  });

  it.each(Object.keys(ANSWERS))("%s is answerable by its role", async (id) => {
    const item = cases.find(candidate => candidate.id === id)!;
    const { query, input, raw } = ANSWERS[id];
    const user = seed.users[item.role];
    const ctx: Ctx = { db: await asUser(user.email), userId: user.id, breweryId: seed.breweryId, roles: [item.role] };
    const result = JSON.stringify(await runCommand(query, input?.(seed) ?? {}, ctx));
    for (const value of raw) expect(result, `${query} for ${item.role}`).toContain(String(value));
  });
});

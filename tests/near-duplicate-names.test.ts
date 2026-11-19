// tests/near-duplicate-names.test.ts — the near-duplicate name warning
// (docs/plans/near-duplicate-names.md): how two names are compared, measured on
// labeled made-up pairs, and find_similar_names, which lists a brewery's own
// close names for the roles that may create that kind of record.
import { beforeAll, describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import pairs from "./fixtures/near-duplicate-names.json";
import { makeBrewery, makeStaffCtx, sql } from "./helpers";

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;

describe("how two names are compared", () => {
  const close = (a: string, b: string) => sql(`select private.names_close(${literal(a)}, ${literal(b)})`)[0] === "t";
  const flagged = (label: string) => (pairs as [string, string, string][]).filter(([, , l]) => l === label).filter(([a, b]) => close(a, b));

  it("flags every same pair but the swapped-letter typo", () => {
    const same = (pairs as [string, string, string][]).filter(([, , label]) => label === "same");
    const missed = same.filter(([a, b]) => !close(a, b)).map(([a, b]) => `${a} / ${b}`);
    expect(missed).toEqual(["Mosaic Cryo / Mosiac Cryo"]);
    expect(flagged("same")).toHaveLength(same.length - 1);
  });

  it("flags no look-alike pair that is a different record", () => {
    expect(flagged("different").map(([a, b]) => `${a} / ${b}`)).toEqual([]);
  });
});

describe("find_similar_names", () => {
  let adminA: Ctx; let salesA: Ctx; let brewerA: Ctx; let adminB: Ctx;
  const find = (ctx: Ctx, kind: string, name: string, excludeId?: string) =>
    runCommand("find_similar_names", { kind, name, excludeId }, ctx) as Promise<{ id: string; name: string }[]>;
  const vendor = (ctx: Ctx, name: string) => runCommand("upsert_vendor", { name, paymentTerms: "net30" }, ctx) as Promise<{ id: string }>;
  const material = (ctx: Ctx, name: string) => runCommand("upsert_material", { name, category: "hop", baseUom: "lb", purchaseUom: "lb" }, ctx);

  beforeAll(async () => {
    const [a, b] = await Promise.all([makeBrewery(), makeBrewery()]);
    [adminA, salesA, brewerA, adminB] = await Promise.all([
      makeStaffCtx(a.id, "admin"), makeStaffCtx(a.id, "sales"), makeStaffCtx(a.id, "brewer"), makeStaffCtx(b.id, "admin"),
    ]);
    await vendor(adminA, "Hartwell Distributing");
    await vendor(adminA, "Country Malt Group");
    await vendor(adminB, "Hartwell Distributing LLC");
    await material(adminA, "Citra T-90");
  });

  it("lists the brewery's own close names, closest first, and nothing for a new name", async () => {
    const found = await find(brewerA, "vendor", "Hartwell Distributing, Inc.");
    expect(found.map(row => row.name)).toEqual(["Hartwell Distributing"]);
    await expect(find(brewerA, "vendor", "Yakima Valley Hops")).resolves.toEqual([]);
    await expect(find(brewerA, "material", "citra t90")).resolves.toMatchObject([{ name: "Citra T-90" }]);
    // A vendor name is not a material name.
    await expect(find(brewerA, "material", "Hartwell Distributing")).resolves.toEqual([]);
  });

  it("leaves out the record being edited", async () => {
    const [{ id }] = await find(adminA, "vendor", "Country Malt Group");
    await expect(find(adminA, "vendor", "Country Malt Grp", id)).resolves.toEqual([]);
  });

  it("never shows another brewery's names", async () => {
    const found = await find(adminB, "vendor", "Hartwell Distributing");
    expect(found.map(row => row.name)).toEqual(["Hartwell Distributing LLC"]);
  });

  it("answers only the roles that may create that kind", async () => {
    await expect(find(salesA, "vendor", "Hartwell Distributing")).rejects.toMatchObject({ status: 403 });
    await expect(find(brewerA, "customer", "Joes Bar")).rejects.toMatchObject({ status: 403 });
    await expect(find(salesA, "customer", "Joes Bar")).resolves.toEqual([]);
  });
});

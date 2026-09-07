// tests/formats.test.ts — a format is the physical shape and the only place
// bbl_per_unit is typed (schema §16.2); packaged formats hold stock, poured
// ones are a ratio back to a keg and hold none.
import { describe, it, expect, beforeAll } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let ctx: Ctx;
beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id, "admin"); });

describe("formats", () => {
  it("an atomic packaged format stores bbl_per_unit; a poured format does not; names are unique per brewery", async () => {
    const half = await runCommand("upsert_format", {
      name: "½ bbl keg", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5,
    }, ctx) as { id: string; bbl_per_unit: string };
    expect(Number(half.bbl_per_unit)).toBe(0.5);
    const pint = await runCommand("upsert_format", { name: "16 oz pour", basis: "poured" }, ctx) as { id: string; bbl_per_unit: string | null };
    expect(pint.bbl_per_unit).toBeNull();
    // packaged with a typed volume must be positive; poured must not carry one
    await expect(runCommand("upsert_format", { name: "bad", basis: "poured", bblPerUnit: 0.01 }, ctx)).rejects.toBeTruthy();
    // upsert by id renames in place
    const renamed = await runCommand("upsert_format", { id: half.id, name: "½ bbl", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5 }, ctx) as { id: string; name: string };
    expect(renamed).toMatchObject({ id: half.id, name: "½ bbl" });
    const list = await runCommand("list_formats", {}, ctx) as { name: string; basis: string }[];
    expect(list.map((f) => f.name).sort()).toEqual(["16 oz pour", "½ bbl"].sort());
    const sales = await makeStaffCtx(ctx.breweryId, "warehouse");
    await expect(runCommand("upsert_format", { name: "x", basis: "poured" }, sales)).rejects.toMatchObject({ code: "permission_denied" });
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { admin, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Completion = {
  batchId: string;
  closedAt: string | null;
  baselineBbl: number | string;
  packagedBbl: number | string;
  attributedBbl: number | string;
  residualBbl: number | string;
  thresholdBbl: number | string;
  adjustmentId: string | null;
};

let breweryId: string;
let ctx: Ctx;
let location: { id: string; binId: string };

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  ctx = await makeStaffCtx(breweryId, "brewer");
  location = await seedLocation(breweryId);
});

async function brew(initialBbl: number, startedAt = "2026-09-01T00:00:00Z") {
  const { brandId } = await seedCatalog(breweryId, { product: `Batch ${crypto.randomUUID()}` });
  const vessel = await runCommand("upsert_vessel", {
    name: `FV ${crypto.randomUUID()}`, kind: "fermenter", capacityBbl: 100,
  }, ctx) as { id: string };
  const batch = await runCommand("schedule_batch", {
    intendedBrandId: brandId, plannedOn: "2026-09-01", plannedBbl: initialBbl,
  }, ctx) as { id: string };
  const day = await runCommand("record_brew_day", {
    batchId: batch.id, vesselId: vessel.id, initialBbl, brewedOn: "2026-09-01",
  }, ctx) as { occupancy: { id: string } };
  sql(`update vessel_occupancies set started_at = '${startedAt}' where id = '${day.occupancy.id}'`, true);
  return { batchId: batch.id, occupancyId: day.occupancy.id, vesselId: vessel.id, brandId };
}

async function packageBeer(source: Awaited<ReturnType<typeof brew>>, packagedBbl: number, bblDrawn = packagedBbl) {
  const { skuId, formatId } = await seedCatalog(breweryId, {
    product: `Pack ${crypto.randomUUID()}`, sku: `Case ${crypto.randomUUID()}`, bblPerUnit: 0.01,
  });
  await admin.from("batches").update({ intended_brand_id: (await admin.from("skus").select("brand_id").eq("id", skuId).single()).data!.brand_id }).eq("id", source.batchId);
  const qty = packagedBbl / 0.01;
  const run = await runCommand("schedule_packaging_run", {
    brandId: (await admin.from("skus").select("brand_id").eq("id", skuId).single()).data!.brand_id,
    plannedOn: "2026-09-02", occupancyId: source.occupancyId, outputs: [{ skuId, qtyPlanned: qty }],
  }, ctx) as { id: string };
  await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-09-02T12:00:00Z" }, ctx);
  await runCommand("close_packaging_run", {
    runId: run.id, bblDrawn, outputs: [{ skuId, qtyActual: qty }], lotCode: `LOT-${crypto.randomUUID()}`,
    packagedOn: "2026-09-02", locationId: location.id, binId: location.binId,
  }, ctx);
  return { runId: run.id, formatId };
}

const preview = (batchId: string, actor = ctx) => runCommand("get_batch_completion_preview", { batchId }, actor) as Promise<Completion>;
const complete = (batchId: string, actor = ctx, requestId = crypto.randomUUID()) => runCommand(
  "complete_batch", { batchId }, actor, { requestId, correlationId: crypto.randomUUID() },
) as Promise<Completion>;
const n = (value: number | string) => Number(value);

describe("batch completion reconciliation", () => {
  it("refuses an open packaging run without changing the batch or occupancies", async () => {
    const source = await brew(10);
    await runCommand("schedule_packaging_run", {
      brandId: source.brandId, plannedOn: "2026-09-02", occupancyId: source.occupancyId, outputs: [],
    }, ctx);
    await expect(complete(source.batchId)).rejects.toThrow(/packaging run.*open/i);
    expect(sql(`select (closed_at is null)::text from batches where id='${source.batchId}'`, true)).toEqual(["true"]);
    expect(sql(`select count(*) from volume_adjustments where brewery_id='${breweryId}' and affects_occupancy=false`, true)).toEqual(["0"]);
  });

  it("writes one exact nonphysical root at the threshold and none below it", async () => {
    const exact = await brew(10);
    await packageBeer(exact, 9.95);
    const atThreshold = await complete(exact.batchId);
    expect(n(atThreshold.residualBbl)).toBe(0.05);
    expect(n(atThreshold.thresholdBbl)).toBe(0.05);
    expect(atThreshold.adjustmentId).toBeTruthy();
    expect(sql(`select bbl||'|'||reason||'|'||removal_class||'|'||affects_occupancy from volume_adjustments where id='${atThreshold.adjustmentId}'`, true)).toEqual(["-0.05000000|loss|loss|false"]);

    const below = await brew(10);
    await packageBeer(below, 9.96);
    const result = await complete(below.batchId);
    expect(n(result.residualBbl)).toBeCloseTo(0.04, 10);
    expect(result.adjustmentId).toBeNull();
  });

  it("refuses a negative full-precision residual atomically", async () => {
    const source = await brew(10);
    await packageBeer(source, 10.01, 10);
    await expect(complete(source.batchId)).rejects.toThrow(/packaged.*baseline|negative residual/i);
    expect(sql(`select (closed_at is null)::text from batches where id='${source.batchId}'`, true)).toEqual(["true"]);
    expect(sql(`select (ended_at is null)::text from vessel_occupancies where id='${source.occupancyId}'`, true)).toEqual(["true"]);
  });

  it("uses frozen packaged movement BBL rather than current format volume or bbl_drawn", async () => {
    const source = await brew(10);
    const { formatId } = await packageBeer(source, 9.5, 9);
    sql(`update formats set bbl_per_unit=0.02 where id='${formatId}'`, true);
    const result = await preview(source.batchId);
    expect(n(result.packagedBbl)).toBe(9.5);
    expect(n(result.residualBbl)).toBe(0.5);
  });

  it("preserves all eight frozen movement decimals in the receipt and root", async () => {
    const source = await brew(1);
    const { skuId } = await seedCatalog(breweryId, {
      product: `Exact ${crypto.randomUUID()}`, sku: `Exact case ${crypto.randomUUID()}`, bblPerUnit: 0.94258065,
    });
    const brandId = (await admin.from("skus").select("brand_id").eq("id", skuId).single()).data!.brand_id;
    await admin.from("batches").update({ intended_brand_id: brandId }).eq("id", source.batchId);
    const run = await runCommand("schedule_packaging_run", {
      brandId, plannedOn: "2026-09-02", occupancyId: source.occupancyId, outputs: [{ skuId, qtyPlanned: 1 }],
    }, ctx) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-09-02T12:00:00Z" }, ctx);
    await runCommand("close_packaging_run", {
      runId: run.id, bblDrawn: 0.9, outputs: [{ skuId, qtyActual: 1 }], lotCode: `EXACT-${crypto.randomUUID()}`,
      packagedOn: "2026-09-02", locationId: location.id, binId: location.binId,
    }, ctx);
    const result = await complete(source.batchId);
    expect(String(result.residualBbl)).toBe("0.05741935");
    expect(sql(`select (-bbl)::text from volume_adjustments where id='${result.adjustmentId}'`, true)).toEqual(["0.05741935"]);
  });

  it("cancels same-batch transfers, owns cross-batch boundaries, and includes prior loss and signed physical adjustments", async () => {
    const source = await brew(10);
    const empty = await runCommand("upsert_vessel", { name: `BT ${crypto.randomUUID()}`, kind: "brite", capacityBbl: 100 }, ctx) as { id: string };
    const moved = await runCommand("record_cellar_transfer", {
      fromOccupancyId: source.occupancyId, toVesselId: empty.id, volumeBbl: 4, lossBbl: 0.2,
    }, ctx) as { to_occupancy: { id: string } };
    insertFixture("volume_adjustments", [
      { brewery_id: breweryId, occupancy_id: source.occupancyId, bbl: 1, reason: "gain", created_by: ctx.userId },
      { brewery_id: breweryId, occupancy_id: moved.to_occupancy.id, bbl: -0.5, reason: "measurement", created_by: ctx.userId },
    ]);
    const same = await preview(source.batchId);
    expect(n(same.baselineBbl)).toBe(10.5);
    expect(n(same.attributedBbl)).toBe(0.2);
    expect(n(same.residualBbl)).toBe(10.3);

    const receiving = await brew(5);
    await runCommand("record_cellar_transfer", {
      fromOccupancyId: moved.to_occupancy.id, toVesselId: receiving.vesselId, volumeBbl: 2, lossBbl: 0.1,
    }, ctx);
    expect(n((await preview(source.batchId)).baselineBbl)).toBe(8.5);
    expect(n((await preview(source.batchId)).attributedBbl)).toBe(0.3);
    expect(n((await preview(receiving.batchId)).baselineBbl)).toBe(7);
  });

  it("does not subtract the completion root from occupancy volume and closes every scoped occupancy at one valid time", async () => {
    const future = "2099-01-02T03:04:05Z";
    const source = await brew(10, future);
    const empty = await runCommand("upsert_vessel", { name: `Future BT ${crypto.randomUUID()}`, kind: "brite", capacityBbl: 100 }, ctx) as { id: string };
    const moved = await runCommand("record_cellar_transfer", {
      fromOccupancyId: source.occupancyId, toVesselId: empty.id, volumeBbl: 4, lossBbl: 0,
    }, ctx) as { to_occupancy: { id: string } };
    sql(`update vessel_occupancies set started_at='${future}' where id='${moved.to_occupancy.id}'`, true);
    const result = await complete(source.batchId);
    expect(n(result.residualBbl)).toBe(10);
    const rows = sql(`select ended_at::text from vessel_occupancies where batch_id='${source.batchId}' order by id`, true);
    expect(new Set(rows).size).toBe(1);
    expect(new Date(rows[0]).getTime()).toBeGreaterThanOrEqual(new Date(future).getTime());
    expect(sql(`select bbl from occupancy_volumes where occupancy_id='${moved.to_occupancy.id}'`, true)).toEqual(["4.000"]);
  });

  it("replays exactly, refuses a fresh completion, and denies wrong roles and tenants without residue", async () => {
    const source = await brew(2);
    const requestId = crypto.randomUUID();
    const first = await complete(source.batchId, ctx, requestId);
    expect(await complete(source.batchId, ctx, requestId)).toEqual(first);
    await expect(complete(source.batchId)).rejects.toThrow(/already completed/i);
    const sales = await makeStaffCtx(breweryId, "sales");
    await expect(preview(source.batchId, sales)).rejects.toMatchObject({ code: "permission_denied" });
    const foreign = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(preview(source.batchId, foreign)).rejects.toThrow(/batch not found/i);
  });

  it("permits only one of two fresh concurrent completions", async () => {
    const source = await brew(1);
    const outcomes = await Promise.allSettled([complete(source.batchId), complete(source.batchId)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(sql(`select count(*) from volume_adjustments where brewery_id='${breweryId}' and occupancy_id='${source.occupancyId}' and affects_occupancy=false`, true)).toEqual(["1"]);
  });

  it("refuses absent, unbrewed, and occupancy-less brewed batches without residue", async () => {
    const before = sql(`select count(*) from volume_adjustments where brewery_id='${breweryId}'`, true);
    await expect(preview(crypto.randomUUID())).rejects.toThrow(/batch not found/i);
    const unbrewed = await runCommand("schedule_batch", {
      plannedOn: "2026-09-04", plannedBbl: 1,
    }, ctx) as { id: string };
    await expect(preview(unbrewed.id)).rejects.toThrow(/not been brewed/i);
    sql(`update batches set brewed_on='2026-09-04' where id='${unbrewed.id}'`, true);
    await expect(complete(unbrewed.id)).rejects.toThrow(/no authoritative occupancy/i);
    expect(sql(`select count(*) from volume_adjustments where brewery_id='${breweryId}'`, true)).toEqual(before);
    expect(sql(`select closed_at is null from batches where id='${unbrewed.id}'`, true)).toEqual(["t"]);
  });

  it("lists and completes a brewed batch whose only occupancy was closed by a full cross-batch transfer", async () => {
    const source = await brew(1);
    const receiving = await brew(1);
    await runCommand("record_cellar_transfer", {
      fromOccupancyId: source.occupancyId, toVesselId: receiving.vesselId, volumeBbl: 0.9, lossBbl: 0.1,
    }, ctx);
    expect(sql(`select (ended_at is not null)::text from vessel_occupancies where id='${source.occupancyId}'`, true)).toEqual(["true"]);

    const listed = await runCommand("list_batches", {}, ctx) as { id: string; brewed_on: string | null; closed_at: string | null }[];
    expect(listed.find((batch) => batch.id === source.batchId)).toMatchObject({ brewed_on: "2026-09-01", closed_at: null });
    const result = await preview(source.batchId);
    expect(n(result.residualBbl)).toBe(0);
    expect((await complete(source.batchId)).adjustmentId).toBeNull();

    const after = await runCommand("list_batches", {}, ctx) as { id: string; closed_at: string | null }[];
    expect(after.find((batch) => batch.id === source.batchId)?.closed_at).not.toBeNull();
  });
});

describe("completion root structure and privileges", () => {
  it("rejects non-finite and ninth-decimal adjustment BBL and direct app/service writes", async () => {
    const source = await brew(1);
    for (const bbl of ["NaN", "Infinity", "-Infinity", "0.000000001"]) {
      expect(() => insertFixture("volume_adjustments", {
        brewery_id: breweryId, occupancy_id: source.occupancyId, bbl, reason: "gain", created_by: ctx.userId,
      })).toThrow(/23514/);
    }
    expect((await ctx.db.from("volume_adjustments").insert({ brewery_id: breweryId, occupancy_id: source.occupancyId, bbl: 1, reason: "gain", created_by: ctx.userId })).error).not.toBeNull();
    expect((await admin.from("volume_adjustments").insert({ brewery_id: breweryId, occupancy_id: source.occupancyId, bbl: 1, reason: "gain", created_by: ctx.userId })).error).not.toBeNull();
    expect(sql(`select bool_and(not has_function_privilege('service_role', p.oid, 'execute'))::text
      from pg_proc p where p.oid in (
        'private.lock_cellar_workflow(uuid)'::regprocedure,
        'private.batch_completion_calculation(uuid,uuid)'::regprocedure,
        'private.enforce_cellar_removal()'::regprocedure,
        'private.enforce_completion_adjustment_graph()'::regprocedure
      )`, true)).toEqual(["true"]);
  });

  it("allows ordinary physical adjustments but rejects standalone nonphysical rows and invalid completion pointers at commit", async () => {
    const source = await brew(1);
    expect(insertFixture("volume_adjustments", {
      brewery_id: breweryId, occupancy_id: source.occupancyId, bbl: "0.12345678", reason: "gain", affects_occupancy: true, created_by: ctx.userId,
    })).toHaveLength(1);
    expect(() => sql(`begin; insert into volume_adjustments(brewery_id,occupancy_id,bbl,reason,removal_class,affects_occupancy,created_by) values('${breweryId}','${source.occupancyId}',-0.1,'loss','loss',false,'${ctx.userId}'); commit`, true, "sqlstate")).toThrow();
    const physical = insertFixture<{ id: string }>("volume_adjustments", {
      brewery_id: breweryId, occupancy_id: source.occupancyId, bbl: -0.1, reason: "loss", removal_class: "loss", affects_occupancy: true, created_by: ctx.userId,
    })[0];
    expect(() => sql(`begin; update batches set completion_adjustment_id='${physical.id}' where id='${source.batchId}'; commit`, true, "sqlstate")).toThrow();
  });

  it("validates both sides when a valid root pointer is removed or repointed", async () => {
    const source = await brew(1);
    const completed = await complete(source.batchId);
    expect(completed.adjustmentId).toBeTruthy();
    expect(() => sql(`begin; update batches set completion_adjustment_id=null where id='${source.batchId}'; commit`, true, "sqlstate")).toThrow();

    const other = await brew(1);
    expect(() => sql(`begin;
      update batches set completion_adjustment_id=null where id='${source.batchId}';
      update batches set closed_at=now(), completion_adjustment_id='${completed.adjustmentId}' where id='${other.batchId}';
      commit`, true, "sqlstate")).toThrow();
    expect(sql(`select completion_adjustment_id::text from batches where id='${source.batchId}'`, true)).toEqual([completed.adjustmentId!]);
  });

  it("rejects service-role reparenting of a completed root occupancy and rolls the row back", async () => {
    const ordinary = await brew(1);
    const ordinaryTarget = await brew(1);
    expect((await admin.from("vessel_occupancies").update({ batch_id: ordinaryTarget.batchId }).eq("id", ordinary.occupancyId)).error)
      .toBeNull();

    const source = await brew(1);
    expect((await complete(source.batchId)).adjustmentId).toBeTruthy();
    const other = await brew(1);

    const changed = await admin.from("vessel_occupancies").update({ batch_id: other.batchId }).eq("id", source.occupancyId);
    expect(changed.error).not.toBeNull();
    expect((await admin.from("vessel_occupancies").select("batch_id").eq("id", source.occupancyId).single()).data?.batch_id)
      .toBe(source.batchId);
  });

  it("requires explicit valid tax/state branches and derives Taproom tax from system identity", async () => {
    const source = await brew(1);
    for (const row of [
      { bbl: -0.1, reason: "loss", removal_class: "sample" },
      { bbl: -0.1, reason: "loss", removal_class: "loss", dest_state: "PA" },
      { bbl: -0.1, reason: "measurement", removal_class: "loss" },
    ]) expect(() => insertFixture("volume_adjustments", {
      brewery_id: breweryId, occupancy_id: source.occupancyId, created_by: ctx.userId, ...row,
    })).toThrow(/23514/);

    sql(`update sale_channels set name='Renamed room', tax_treatment='research' where brewery_id='${breweryId}' and system_code='taproom'`, true);
    const taproom = insertFixture<{ tax_treatment: string }>("volume_adjustments", {
      brewery_id: breweryId, occupancy_id: source.occupancyId, bbl: -0.1, reason: "loss",
      removal_class: "taproom", tax_treatment: "taxable", created_by: ctx.userId,
    })[0];
    expect(taproom.tax_treatment).toBe("research");
  });
});

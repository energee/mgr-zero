import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { admin, DB, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

let breweryId: string;
let adminCtx: Ctx;
let brewerCtx: Ctx;
let location: { id: string; binId: string };
let fixtureDate: string;

type Period = { start: string; end: string };

function adjustmentPeriod(adjustmentId: string): Period {
  const [start, end] = sql(`select concat_ws('|',
    date_trunc('month', adjustment.created_at at time zone brewery.timezone)::date,
    (date_trunc('month', adjustment.created_at at time zone brewery.timezone) + interval '1 month - 1 day')::date)
    from volume_adjustments adjustment join breweries brewery on brewery.id=adjustment.brewery_id
    where adjustment.id='${adjustmentId}'`, true)[0].split("|");
  return { start, end };
}

function previousPeriod(period: Period): Period {
  const [start, end] = sql(`select concat_ws('|',
    (date_trunc('month','${period.start}'::date) - interval '1 month')::date,
    (date_trunc('month','${period.start}'::date) - interval '1 day')::date)`, true)[0].split("|");
  return { start, end };
}

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  [adminCtx, brewerCtx] = await Promise.all([
    makeStaffCtx(breweryId, "admin"),
    makeStaffCtx(breweryId, "brewer"),
  ]);
  location = await seedLocation(breweryId);
  fixtureDate = sql(`select ((now() at time zone timezone)::date - 2)::text from breweries where id='${breweryId}'`, true)[0];
});

async function exactCompletion() {
  const { brandId, skuId } = await seedCatalog(breweryId, {
    product: `Loss review ${crypto.randomUUID()}`,
    sku: `Exact case ${crypto.randomUUID()}`,
    bblPerUnit: 0.94258065,
  });
  const vessel = await runCommand("upsert_vessel", {
    name: `FV ${crypto.randomUUID()}`, kind: "fermenter", capacityBbl: 2,
  }, brewerCtx) as { id: string };
  const batch = await runCommand("schedule_batch", {
    intendedBrandId: brandId, plannedOn: fixtureDate, plannedBbl: 1,
  }, brewerCtx) as { id: string };
  const brewed = await runCommand("record_brew_day", {
    batchId: batch.id, vesselId: vessel.id, initialBbl: 1, brewedOn: fixtureDate,
  }, brewerCtx) as { occupancy: { id: string } };
  const run = await runCommand("schedule_packaging_run", {
    brandId, plannedOn: fixtureDate, occupancyId: brewed.occupancy.id,
    outputs: [{ skuId, qtyPlanned: 1 }],
  }, brewerCtx) as { id: string };
  await runCommand("update_packaging_run", { runId: run.id, startedAt: `${fixtureDate}T00:00:00Z` }, brewerCtx);
  await runCommand("close_packaging_run", {
    runId: run.id, bblDrawn: 0.9, outputs: [{ skuId, qtyActual: 1 }],
    lotCode: `LOSS-${crypto.randomUUID()}`, packagedOn: fixtureDate, locationId: location.id, binId: location.binId,
  }, brewerCtx);
  const completion = await runCommand("complete_batch", { batchId: batch.id }, brewerCtx) as { adjustmentId: string; residualBbl: string };
  return { batchId: batch.id, adjustmentId: completion.adjustmentId, residualBbl: completion.residualBbl, period: adjustmentPeriod(completion.adjustmentId) };
}

const reattribute = (adjustmentId: string, bbl: string | number, classification: "sample" | "taproom" | "destruction", destinationState?: string, requestId = crypto.randomUUID()) =>
  runCommand("reattribute_loss", { adjustmentId, bbl, classification, ...(destinationState ? { destinationState } : {}) }, adminCtx, { requestId, correlationId: crypto.randomUUID() }) as Promise<any>;

function expectSqlState(statement: string, state: string) {
  try { sql(statement, true, "sqlstate"); }
  catch (error) {
    expect(String((error as { stderr?: string | Buffer }).stderr ?? error)).toContain(`ERROR:  ${state}`);
    return;
  }
  throw new Error(`expected SQLSTATE ${state}`);
}

describe("completion loss review", () => {
  it("keeps the exact completion residual through review, allocation, and compliance projection", async () => {
    const completed = await exactCompletion();
    expect(String(completed.residualBbl)).toBe("0.05741935");

    const before = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: completed.period.start, periodEnd: completed.period.end,
    }, adminCtx) as any;
    expect(String(before.figures.cellarRemovals.loss)).toBe("0.05741935");
    expect(String(before.figures.removals.loss)).toBe("0.05741935");

    const review = await runCommand("get_loss_review", {
      periodStart: completed.period.start, periodEnd: completed.period.end,
    }, adminCtx) as any[];
    expect(review).toEqual([expect.objectContaining({
      adjustment_id: completed.adjustmentId,
      batch_id: completed.batchId,
      original_bbl: "0.05741935",
      remaining_bbl: "0.05741935",
      allocations: [],
    })]);

    for (const [bbl, classification, destinationState] of [
      ["0.02000000", "sample", "PA"],
      ["0.03741935", "destruction", undefined],
    ] as const) {
      await runCommand("reattribute_loss", {
        adjustmentId: completed.adjustmentId, bbl, classification, ...(destinationState ? { destinationState } : {}),
      }, adminCtx);
    }

    const after = await runCommand("get_loss_review", {
      periodStart: completed.period.start, periodEnd: completed.period.end,
    }, adminCtx) as any[];
    expect(String(after[0].remaining_bbl)).toBe("0.00000000");
    expect(sql(`select round(bbl,8)::text from volume_adjustment_reclassifications where source_adjustment_id='${completed.adjustmentId}' order by created_at`)).toEqual(["0.02000000", "0.03741935"]);
    expect(sql(`select reclassification_id::text||'|'||sum(bbl)::text from volume_adjustments where reclassification_id is not null group by reclassification_id order by reclassification_id`)).toEqual(expect.arrayContaining([
      expect.stringMatching(/\|0\.00000000$/), expect.stringMatching(/\|0\.00000000$/),
    ]));

    const report = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: completed.period.start, periodEnd: completed.period.end,
    }, adminCtx) as any;
    expect(report.figures.cellarRemovals).toMatchObject({ loss: 0, sample: 0.02, destruction: 0.03741935 });
    expect(Object.values(report.figures.removals).reduce((sum: number, value) => sum + Number(value), 0)).toBeCloseTo(0.05741935, 8);
  });

  it("rejects invalid precision, invalid target state, excess, wrong source, tenant, and role without rows", async () => {
    const completed = await exactCompletion();
    const before = sql(`select count(*) from volume_adjustment_reclassifications where source_adjustment_id='${completed.adjustmentId}'`, true);
    await expect(runCommand("reattribute_loss", {
      adjustmentId: completed.adjustmentId, bbl: "0.0100000000000000001",
      classification: "sample", destinationState: "PA",
    }, adminCtx)).rejects.toMatchObject({ status: 400 });
    for (const p_bbl of ["NaN", "Infinity", "-Infinity", "0.000000001", "-0.01"] as const) {
      const result = await adminCtx.db.rpc("reattribute_loss", {
        p_brewery: breweryId, p_adjustment: completed.adjustmentId, p_bbl,
        p_classification: "sample", p_destination_state: "PA", p_request_id: crypto.randomUUID(),
      });
      expect(result.error?.message).toMatch(/positive, finite|eight fractional/i);
    }
    await expect(reattribute(completed.adjustmentId, "0.01", "sample")).rejects.toThrow(/destination state/i);
    await expect(runCommand("reattribute_loss", {
      adjustmentId: completed.adjustmentId, bbl: 0.01, classification: "taproom", destinationState: "PA",
    }, adminCtx)).rejects.toThrow(/destination state/i);
    await expect(runCommand("reattribute_loss", {
      adjustmentId: completed.adjustmentId, bbl: 0.01, classification: "loss",
    }, adminCtx)).rejects.toMatchObject({ status: 400 });
    await expect(reattribute(completed.adjustmentId, "1", "destruction")).rejects.toThrow(/remaining/i);

    const physical = insertFixture<{ id: string }>("volume_adjustments", {
      brewery_id: breweryId,
      occupancy_id: sql(`select occupancy_id::text from volume_adjustments where id='${completed.adjustmentId}'`, true)[0],
      bbl: -0.01, reason: "loss", created_by: adminCtx.userId,
    })[0];
    await expect(reattribute(physical.id, "0.01", "destruction")).rejects.toThrow(/completion loss not found/i);
    const foreign = await makeBrewery();
    const foreignAdmin = await makeStaffCtx(foreign.id, "admin");
    await expect(runCommand("reattribute_loss", {
      adjustmentId: completed.adjustmentId, bbl: 0.01, classification: "destruction",
    }, foreignAdmin)).rejects.toThrow(/completion loss not found/i);
    await expect(runCommand("get_loss_review", { periodStart: completed.period.start, periodEnd: completed.period.end }, brewerCtx)).rejects.toMatchObject({ status: 403 });
    await expect(runCommand("reattribute_loss", {
      adjustmentId: completed.adjustmentId, bbl: 0.01, classification: "destruction",
    }, brewerCtx)).rejects.toMatchObject({ status: 403 });
    expect(sql(`select count(*) from volume_adjustment_reclassifications where source_adjustment_id='${completed.adjustmentId}'`, true)).toEqual(before);
    expect((await reattribute(completed.adjustmentId, 0.00000001, "destruction")).bbl).toBe("0.00000001");
  });

  it("freezes Taproom tax by system identity and refuses a missing system channel", async () => {
    const completed = await exactCompletion();
    await admin.from("sale_channels").update({ name: `Renamed ${crypto.randomUUID()}`, tax_treatment: "research" }).eq("brewery_id", breweryId).eq("system_code", "taproom");
    const allocation = await reattribute(completed.adjustmentId, "0.01", "taproom");
    expect(allocation.tax_treatment).toBe("research");
    expect(sql(`select tax_treatment::text from volume_adjustments where reclassification_id='${allocation.id}' and reclassification_leg='replacement'`, true)).toEqual(["research"]);

    const missing = await exactCompletion();
    await admin.from("sale_channels").update({ system_code: null }).eq("brewery_id", breweryId).eq("system_code", "taproom");
    await expect(reattribute(missing.adjustmentId, "0.01", "taproom")).rejects.toThrow(/Taproom sale channel/i);
    await admin.from("sale_channels").update({ system_code: "taproom" }).eq("brewery_id", breweryId).is("system_code", null).like("name", "Renamed %");
  });

  it("replays exactly, rejects changed request reuse, and serializes actual Postgres contenders", async () => {
    const completed = await exactCompletion();
    const requestId = crypto.randomUUID();
    const first = await reattribute(completed.adjustmentId, "0.05741935", "sample", "PA", requestId);
    expect(await reattribute(completed.adjustmentId, "0.05741935", "sample", "PA", requestId)).toEqual(first);
    await expect(reattribute(completed.adjustmentId, "0.02", "sample", "PA", requestId)).rejects.toMatchObject({ status: 409 });

    const current = await exactCompletion();
    const currentActor = await makeStaffCtx(breweryId, "admin");
    const currentRequest = crypto.randomUUID();
    const currentPayload = { adjustmentId: current.adjustmentId, bbl: 0.01, classification: "destruction" as const };
    await runCommand("reattribute_loss", currentPayload, currentActor, { requestId: currentRequest, correlationId: crypto.randomUUID() });
    await admin.from("brewery_users").update({ role: "warehouse" }).eq("brewery_id", breweryId).eq("user_id", currentActor.userId);
    expect((await currentActor.db.rpc("reattribute_loss", {
      p_brewery: breweryId, p_adjustment: current.adjustmentId, p_bbl: 0.01,
      p_classification: "destruction", p_destination_state: null, p_request_id: currentRequest,
    })).error?.code).toBe("42501");

    const race = await exactCompletion();
    const a = new Client({ connectionString: DB });
    const b = new Client({ connectionString: DB });
    await Promise.all([a.connect(), b.connect()]);
    let pending: Promise<unknown> | undefined;
    const args = [breweryId, race.adjustmentId, "0.04", "sample", "PA"];
    try {
      await a.query("begin");
      await a.query("select set_config('request.jwt.claim.sub',$1,true)", [adminCtx.userId]);
      await a.query("set local role authenticated");
      await a.query("select public.reattribute_loss($1,$2,$3,$4::public.cellar_removal_class,$5,$6)", [...args, crypto.randomUUID()]);
      await a.query("reset role");
      await b.query("begin");
      await b.query("select set_config('request.jwt.claim.sub',$1,true)", [adminCtx.userId]);
      await b.query("set local role authenticated");
      const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
      pending = b.query("select public.reattribute_loss($1,$2,$3,$4::public.cellar_removal_class,$5,$6)", [...args, crypto.randomUUID()]);
      await expect.poll(async () => sql(`select wait_event_type from pg_stat_activity where pid=${pid}`, true)[0]).toBe("Lock");
      await a.query("commit");
      await expect(pending).rejects.toThrow(/remaining completion loss/i);
      expect(sql(`select count(*) from volume_adjustment_reclassifications where source_adjustment_id='${race.adjustmentId}'`, true)).toEqual(["1"]);
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
      if (pending) await pending.catch(() => undefined);
    }
  });

  it("denies direct application and service DML and private helper execution", async () => {
    const completed = await exactCompletion();
    const row = {
      brewery_id: breweryId, source_adjustment_id: completed.adjustmentId, bbl: 0.01,
      target_class: "destruction", created_by: adminCtx.userId,
    };
    expect((await adminCtx.db.from("volume_adjustment_reclassifications").insert(row)).error).not.toBeNull();
    expect((await admin.from("volume_adjustment_reclassifications").insert(row)).error).not.toBeNull();
    expect((await admin.from("volume_adjustments").update({ note: "forbidden" }).eq("id", completed.adjustmentId)).error).not.toBeNull();
    expect((await admin.rpc("get_loss_review", { p_brewery: breweryId, p_start: completed.period.start, p_end: completed.period.end })).error).not.toBeNull();
    expect(sql(`select has_table_privilege('authenticated','volume_adjustment_reclassifications','INSERT,UPDATE,DELETE,TRUNCATE')::text,has_table_privilege('service_role','volume_adjustment_reclassifications','INSERT,UPDATE,DELETE,TRUNCATE')::text`, true)).toEqual(["false|false"]);
    for (const role of ["authenticated", "service_role"]) {
      expectSqlState(`begin; set local role ${role}; truncate volume_adjustment_reclassifications; commit`, "42501");
      expectSqlState(`begin; set local role ${role}; select private.lock_cellar_workflow('${breweryId}'); commit`, "42501");
    }
  });

  it("rejects later leg, source, root-allocation, and occupancy graph corruption at commit", async () => {
    const completed = await exactCompletion();
    const allocation = await reattribute(completed.adjustmentId, "0.02", "sample", "PA");
    const sourceOccupancy = sql(`select occupancy_id::text from volume_adjustments where id='${completed.adjustmentId}'`, true)[0];
    const other = await exactCompletion();
    const otherOccupancy = sql(`select occupancy_id::text from volume_adjustments where id='${other.adjustmentId}'`, true)[0];
    const physical = insertFixture<{ id: string }>("volume_adjustments", {
      brewery_id: breweryId, occupancy_id: sourceOccupancy, bbl: -0.01, reason: "loss", created_by: adminCtx.userId,
    })[0];
    expectSqlState(`begin; update volume_adjustments set removal_class=null where reclassification_id='${allocation.id}' and reclassification_leg='reverse'; commit`, "23514");
    expect(sql(`select removal_class::text from volume_adjustments where reclassification_id='${allocation.id}' and reclassification_leg='reverse'`, true)).toEqual(["loss"]);
    expectSqlState(`begin; update volume_adjustments set bbl=-0.03 where reclassification_id='${allocation.id}' and reclassification_leg='replacement'; commit`, "P0001");
    expectSqlState(`begin; update volume_adjustment_reclassifications set source_adjustment_id='${physical.id}' where id='${allocation.id}'; commit`, "P0001");
    expectSqlState(`begin; update volume_adjustments set bbl=-0.01 where id='${completed.adjustmentId}'; commit`, "P0001");
    expectSqlState(`begin; update volume_adjustments set occupancy_id='${otherOccupancy}' where reclassification_id='${allocation.id}' and reclassification_leg='reverse'; commit`, "P0001");
    const otherBatch = sql(`select batch_id::text from vessel_occupancies where id='${otherOccupancy}'`, true)[0];
    expectSqlState(`begin; update vessel_occupancies set batch_id='${otherBatch}' where id='${sourceOccupancy}'; commit`, "P0001");
  });

  it("posts signed corrections in their actual period, leaves occupancy unchanged, preserves filed snapshots, and gates cellar Taproom filing", async () => {
    const completed = await exactCompletion();
    const prior = previousPeriod(completed.period);
    const occupancy = sql(`select occupancy_id::text from volume_adjustments where id='${completed.adjustmentId}'`, true)[0];
    const beforeVolume = sql(`select bbl::text from occupancy_volumes where occupancy_id='${occupancy}'`, true);
    sql(`update volume_adjustments set created_at='${prior.start}T12:00:00Z' where id='${completed.adjustmentId}'; update batches set closed_at='${prior.start}T12:00:00Z' where completion_adjustment_id='${completed.adjustmentId}'`, true);
    const filed = await runCommand("file_compliance_report", {
      jurisdiction: "TTB", periodStart: prior.start, periodEnd: prior.end,
    }, adminCtx) as any;
    const frozen = JSON.stringify(filed.figures);

    const currentBefore = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: completed.period.start, periodEnd: completed.period.end,
    }, adminCtx) as any;

    const clock = new Client({ connectionString: DB });
    await clock.connect();
    let correction!: { id: string };
    try {
      const beforeRpc = (await clock.query("select clock_timestamp() at")).rows[0].at as Date;
      correction = await reattribute(completed.adjustmentId, "0.02", "sample", "PA");
      const afterRpc = (await clock.query("select clock_timestamp() at")).rows[0].at as Date;
      const postingTimes = (await clock.query<{ kind: string; created_at: Date }>(`
        select 'allocation' kind, created_at
          from volume_adjustment_reclassifications where brewery_id=$1 and id=$2
        union all
        select reclassification_leg kind, created_at
          from volume_adjustments where brewery_id=$1 and reclassification_id=$2
        order by kind`, [breweryId, correction.id])).rows;
      expect(postingTimes.map((row) => row.kind)).toEqual(["allocation", "replacement", "reverse"]);
      for (const row of postingTimes) {
        expect(row.created_at.getTime(), `${row.kind} must use the RPC transaction time`).toBeGreaterThanOrEqual(beforeRpc.getTime());
        expect(row.created_at.getTime(), `${row.kind} must use the RPC transaction time`).toBeLessThanOrEqual(afterRpc.getTime());
      }
    } finally {
      await clock.end();
    }
    sql(`update volume_adjustment_reclassifications set created_at='${completed.period.start}T12:00:00Z' where id='${correction.id}'; update volume_adjustments set created_at='${completed.period.start}T12:00:00Z' where reclassification_id='${correction.id}'`, true);
    expect(sql(`select bbl::text from occupancy_volumes where occupancy_id='${occupancy}'`, true)).toEqual(beforeVolume);
    const priorReport = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: prior.start, periodEnd: prior.end,
    }, adminCtx) as any;
    const currentReport = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: completed.period.start, periodEnd: completed.period.end,
    }, adminCtx) as any;
    expect(priorReport.figures.cellarRemovals.loss).toBe(0.05741935);
    expect(Number(currentReport.figures.cellarRemovals.loss) - Number(currentBefore.figures.cellarRemovals.loss ?? 0)).toBeCloseTo(-0.02, 8);
    expect(Number(currentReport.figures.cellarRemovals.sample) - Number(currentBefore.figures.cellarRemovals.sample ?? 0)).toBeCloseTo(0.02, 8);
    expect(JSON.stringify((await admin.from("report_filings").select("figures").eq("id", filed.id).single()).data!.figures)).toBe(frozen);

    const taproom = await exactCompletion();
    await reattribute(taproom.adjustmentId, "0.01", "taproom");
    const report = await runCommand("generate_compliance_report", {
      jurisdiction: "TTB", periodStart: taproom.period.start, periodEnd: taproom.period.end,
    }, adminCtx) as any;
    expect(report.externalMappingRequired).toEqual(["taproom"]);
    expect(report.warnings.join(" ")).toMatch(/approved external filing-line mapping/i);
    await expect(runCommand("file_compliance_report", {
      jurisdiction: "TTB", periodStart: taproom.period.start, periodEnd: taproom.period.end,
    }, adminCtx)).rejects.toThrow(/approved external filing-line mapping/i);
  });
});

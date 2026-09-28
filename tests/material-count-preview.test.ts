import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, seedMovement, DB, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Plan = { revision: string; lines: { material_id: string; qty_expected: number; qty_counted: number; adjustments: { lot_id: string | null; lot_code: string | null; qty_expected: number; qty_counted: number; delta: number }[] }[] };
async function fixture() {
  const b = await makeBrewery();
  const ctx = await makeStaffCtx(b.id, "warehouse");
  const wh = await seedLocation(b.id);
  const material = await runCommand("upsert_material", { name: "Preview hops", category: "hop", baseUom: "lb", purchaseUom: "lb", lotTracked: true }, ctx) as { id: string };
  const lots: string[] = [];
  for (const [index, qty] of [10, 20, 30].entries()) {
    const inserted = await admin.from("material_lots").insert({ brewery_id: b.id, material_id: material.id, lot_code: `L-${index}`, received_on: `2026-0${index + 1}-01`, best_by: index === 2 ? null : `2027-0${index + 1}-01` }).select("id").single();
    if (inserted.error) throw inserted.error;
    lots.push(inserted.data.id);
    await seedMovement(b.id, { materialId: material.id, locationId: wh.id, binId: wh.binId, lotId: inserted.data.id, qty, type: "receipt", createdBy: ctx.userId });
  }
  const input = { locationId: wh.id, binId: wh.binId, lines: [{ materialId: material.id, qty: 45 }] };
  return { b, ctx, wh, material, lots, input };
}

it("previews split FEFO allocations and commits exactly those movements with stable replay", async () => {
  const f = await fixture();
  const plan = await runCommand("get_material_count_preview", f.input, f.ctx) as Plan;
  expect(plan.lines[0].adjustments.map(row => [row.lot_id, row.delta])).toEqual([[f.lots[0], -10], [f.lots[1], -5]]);
  const requestId = crypto.randomUUID();
  const input = { ...f.input, revision: plan.revision };
  const result = await runCommand("record_material_count", input, f.ctx, { requestId, correlationId: crypto.randomUUID() }) as { id: string };
  expect(await runCommand("record_material_count", input, f.ctx, { requestId, correlationId: crypto.randomUUID() })).toEqual(result);
  const movements = await admin.from("material_movements").select("lot_id, qty").eq("material_id", f.material.id).eq("type", "count_adjustment").order("qty");
  expect(movements.data).toEqual([{ lot_id: f.lots[0], qty: -10 }, { lot_id: f.lots[1], qty: -5 }]);
  const overInput = { ...f.input, lines: [{ materialId: f.material.id, qty: 50 }] };
  const over = await runCommand("get_material_count_preview", overInput, f.ctx) as Plan;
  expect(over.lines[0].adjustments.map(row => [row.lot_id, row.delta])).toEqual([[f.lots[2], 5]]);
});

it("rejects changed stock and lot metadata without recording a count", async () => {
  const f = await fixture();
  const plan = await runCommand("get_material_count_preview", f.input, f.ctx) as Plan;
  await seedMovement(f.b.id, { materialId: f.material.id, locationId: f.wh.id, binId: f.wh.binId, lotId: f.lots[2], qty: 1, type: "receipt", createdBy: f.ctx.userId });
  await expect(runCommand("record_material_count", { ...f.input, revision: plan.revision }, f.ctx)).rejects.toMatchObject({ code: "conflict" });
  const fresh = await runCommand("get_material_count_preview", f.input, f.ctx) as Plan;
  const changed = await admin.from("material_lots").update({ best_by: "2026-10-01" }).eq("id", f.lots[2]);
  if (changed.error) throw changed.error;
  await expect(runCommand("record_material_count", { ...f.input, revision: fresh.revision }, f.ctx)).rejects.toMatchObject({ code: "conflict" });
  expect((await admin.from("material_counts").select("id").eq("brewery_id", f.b.id)).data).toEqual([]);
});

it("includes zero-stock newest lots in overage revisions and rejects unauthorized callers", async () => {
  const f = await fixture();
  const input = { ...f.input, lines: [{ materialId: f.material.id, qty: 65 }] };
  const plan = await runCommand("get_material_count_preview", input, f.ctx) as Plan;
  const lot = await admin.from("material_lots").insert({ brewery_id: f.b.id, material_id: f.material.id, lot_code: "Newest", received_on: "2026-09-01" }).select("id").single();
  if (lot.error) throw lot.error;
  await expect(runCommand("record_material_count", { ...input, revision: plan.revision }, f.ctx)).rejects.toMatchObject({ code: "conflict" });
  const fresh = await runCommand("get_material_count_preview", input, f.ctx) as Plan;
  expect(fresh.lines[0].adjustments.map(row => [row.lot_id, row.delta])).toEqual([[lot.data.id, 5]]);
  const sales = await makeStaffCtx(f.b.id, "sales");
  await expect(runCommand("get_material_count_preview", input, sales)).rejects.toMatchObject({ code: "permission_denied" });
  const other = await makeStaffCtx((await makeBrewery()).id);
  expect((await other.db.rpc("get_material_count_preview", { p_brewery: f.b.id, p_location: f.wh.id, p_bin: f.wh.binId, p_lines: [{ material_id: f.material.id, qty: 65 }] })).error?.code).toBe("42501");
});


it("records equal counts without movements and rejects empty, duplicate, and invalid quantities", async () => {
  const f = await fixture();
  const equal = { ...f.input, lines: [{ materialId: f.material.id, qty: 60 }] };
  const plan = await runCommand("get_material_count_preview", equal, f.ctx) as Plan;
  expect(plan.lines[0].adjustments).toEqual([]);
  const saved = await runCommand("record_material_count", { ...equal, revision: plan.revision }, f.ctx) as { id: string; lines: { movement_ids: string[] }[] };
  expect(saved.lines[0].movement_ids).toEqual([]);
  expect((await admin.from("material_count_lines").select("qty_expected, qty_counted").eq("count_id", saved.id)).data).toEqual([{ qty_expected: 60, qty_counted: 60 }]);
  await expect(runCommand("get_material_count_preview", { ...f.input, lines: [] }, f.ctx)).rejects.toBeDefined();
  await expect(runCommand("get_material_count_preview", { ...f.input, lines: [f.input.lines[0], f.input.lines[0]] }, f.ctx)).rejects.toThrow("once");
  await expect(runCommand("get_material_count_preview", { ...f.input, lines: [{ materialId: f.material.id, qty: 0.00001 }] }, f.ctx)).rejects.toThrow("four decimal");
});

it.each(["material", "lot", "new lot", "ledger"] as const)("fails promptly and recovers when a concurrent %s writer holds its lock", async kind => {
  const f = await fixture();
  const plan = await runCommand("get_material_count_preview", f.input, f.ctx) as Plan;
  const writer = spawn("psql", [DB, "-X", "-Atq", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
  const ended = once(writer, "exit");
  const locked = new Promise<void>((resolve, reject) => {
    let output = "";
    writer.stdout.on("data", data => { output += data.toString(); if (output.includes("COUNT_LOCK_READY")) resolve(); });
    writer.stderr.on("data", data => reject(new Error(data.toString())));
    writer.on("error", reject);
  });
  const statement = kind === "material"
    ? `select id from public.materials where id = '${f.material.id}' for update`
    : kind === "lot"
      ? `update public.material_lots set best_by = '2026-10-01' where id = '${f.lots[2]}'`
      : kind === "new lot"
        ? `insert into public.material_lots (brewery_id, material_id, lot_code, received_on) values ('${f.b.id}', '${f.material.id}', 'Concurrent newest', '2026-09-27')`
        : "lock table public.material_movements in row exclusive mode";
  writer.stdin.write(`begin; ${statement};\n\\echo COUNT_LOCK_READY\n`);
  try {
    await locked;
    await expect(runCommand("get_material_count_preview", f.input, f.ctx)).rejects.toThrow("busy");
    await expect(runCommand("record_material_count", { ...f.input, revision: plan.revision }, f.ctx)).rejects.toThrow("busy");
    // The material writer can finish its UPDATE after the count's NOWAIT refusal.
    if (kind === "material") writer.stdin.write(`update public.materials set name = 'Edited hops' where id = '${f.material.id}';\n`);
  } finally { writer.stdin.end("commit;\n"); await ended; }
  const refreshed = await runCommand("get_material_count_preview", f.input, f.ctx) as Plan;
  expect(refreshed.lines).toHaveLength(1);
  if (kind !== "ledger") expect(refreshed.revision).not.toBe(plan.revision);
});


it("replays completed pre-preview requests but refuses new or changed unpreviewed counts", async () => {
  const f = await fixture();
  const requestId = crypto.randomUUID();
  const execution = { requestId, correlationId: crypto.randomUUID() };
  const result = { id: crypto.randomUUID(), counted_on: "2026-09-27", lines: [] };
  const payload = { brewery: f.b.id, location: f.wh.id, bin: f.wh.binId, counted_on: null, lines: [{ material_id: f.material.id, qty: 45 }] };
  sql(`insert into private.command_requests (actor_id, brewery_id, request_id, command_name, payload_hash, result)
    values ('${f.ctx.userId}', '${f.b.id}', '${requestId}', 'record_material_count',
      extensions.digest('${JSON.stringify(payload)}'::jsonb::text, 'sha256'), '${JSON.stringify(result)}'::jsonb)`);
  expect(await runCommand("record_material_count", f.input, f.ctx, execution)).toEqual(result);
  await expect(runCommand("record_material_count", { ...f.input, lines: [{ materialId: f.material.id, qty: 44 }] }, f.ctx, execution)).rejects.toMatchObject({ code: "conflict" });
  await expect(runCommand("record_material_count", f.input, f.ctx)).rejects.toThrow("Preview the count");
  expect((await admin.from("material_counts").select("id").eq("brewery_id", f.b.id)).data).toEqual([]);
});

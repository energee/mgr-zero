// Bin identity is case-insensitive within one tenant/location without rewriting historical bins.
import { afterEach, beforeAll, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { admin, closePgSessions, makeBrewery, makeStaffCtx, pgSession, seedCatalog, sql, staffSession } from "./helpers";

let ctx: Ctx;
type Bin = { id: string; name: string };

beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id); });
afterEach(closePgSessions);

async function location() {
  const row = await runCommand("create_location", { name: crypto.randomUUID(), uses: ["warehouse"] }, ctx) as Bin;
  const bins = await runCommand("list_bins", { locationId: row.id }, ctx) as Bin[];
  return { ...row, bins };
}

it("rejects case-variant creates and edits at the authenticated RPC boundary", async () => {
  const loc = await location();
  const create = await ctx.db.rpc("create_bin", { p_brewery: ctx.breweryId, p_location: loc.id, p_name: " dry ", p_request_id: crypto.randomUUID() });
  expect(create.error?.message).toBe("A bin named Dry already exists here");
  const edit = await ctx.db.rpc("update_bin", { p_brewery: ctx.breweryId, p_bin: loc.bins[0].id, p_name: "dRy", p_request_id: crypto.randomUUID() });
  expect(edit.error?.message).toBe("A bin named Dry already exists here");
  expect(await runCommand("list_bins", { locationId: loc.id }, ctx)).toEqual(loc.bins);
});

it("preserves display spelling, allows own case-only rename, and does not impose a name cap", async () => {
  const loc = await location();
  const dry = loc.bins.find(bin => bin.name === "Dry")!;
  expect(await runCommand("update_bin", { binId: dry.id, name: "dry" }, ctx)).toMatchObject({ id: dry.id, name: "dry" });
  const name = `${"LongBin".repeat(30)}12345`;
  expect(name).toHaveLength(215);
  expect(await runCommand("create_bin", { locationId: loc.id, name }, ctx)).toMatchObject({ name });
});

it("keeps matching names independent across locations and tenants", async () => {
  const a = await location();
  const b = await location();
  const other = await makeStaffCtx((await makeBrewery()).id);
  const c = await runCommand("create_location", { name: "Other warehouse", uses: ["warehouse"] }, other) as Bin;
  for (const [owner, locationId, name] of [[ctx, a.id, "Rack"], [ctx, b.id, "rack"], [other, c.id, "RACK"]] as const) {
    expect(await runCommand("create_bin", { locationId, name }, owner)).toMatchObject({ name });
  }
  expect((await other.db.rpc("create_bin", { p_brewery: other.breweryId, p_location: a.id, p_name: "Other", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
});

it("allows unchanged historical collisions without renaming bins or moving linked stock", async () => {
  const loc = await location();
  const dry = loc.bins.find(bin => bin.name === "Dry")!;
  const legacy = await admin.from("bins").insert(["dry", " dry "].map(name => ({ brewery_id: ctx.breweryId, location_id: loc.id, name }))).select();
  expect(legacy.error).toBeNull();
  const { skuId } = await seedCatalog(ctx.breweryId, { product: "Historical bin beer", format: "Historical bin can" });
  await runCommand("record_movement", { skuId, locationId: loc.id, binId: dry.id, qty: 3, type: "opening_balance" }, ctx);
  const stock = await runCommand("get_bin_on_hand", { skuId }, ctx);
  for (const bin of [dry, ...legacy.data!]) expect(await runCommand("update_bin", { binId: bin.id, name: bin.name }, ctx)).toMatchObject({ id: bin.id, name: bin.name });
  await expect(runCommand("create_bin", { locationId: loc.id, name: "DRY" }, ctx)).rejects.toThrow(/already exists here/);
  expect(await runCommand("get_bin_on_hand", { skuId }, ctx)).toEqual(stock);
  expect((await runCommand("list_bins", { locationId: loc.id }, ctx) as Bin[]).filter(bin => bin.name.trim().toLowerCase() === "dry")).toEqual(expect.arrayContaining([dry, ...legacy.data!].map(bin => expect.objectContaining({ id: bin.id, name: bin.name }))));
});

it("replays historical raw create/edit outcomes before validating current name collisions", async () => {
  const loc = await location();
  for (const command of ["create_bin", "update_bin"] as const) {
    const requestId = crypto.randomUUID();
    const binId = crypto.randomUUID();
    const payload = command === "create_bin" ? { brewery: ctx.breweryId, location: loc.id, name: " dry " } : { brewery: ctx.breweryId, bin: binId, name: " dry " };
    const result = { id: binId, name: " dry ", historical: true };
    sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
      values('${ctx.userId}','${ctx.breweryId}','${requestId}','${command}',extensions.digest('${JSON.stringify(payload)}'::jsonb::text,'sha256'),'${JSON.stringify(result)}'::jsonb)`);
    const input = command === "create_bin" ? { locationId: loc.id, name: " dry " } : { binId, name: " dry " };
    expect(await runCommand(command, input, ctx, { requestId, correlationId: requestId })).toEqual(result);
    await expect(runCommand(command, { ...input, name: "dry" }, ctx, { requestId, correlationId: requestId })).rejects.toMatchObject({ status: 409 });
  }
  expect(await runCommand("list_bins", { locationId: loc.id }, ctx)).toEqual(loc.bins);
});

it.each(["create/create", "edit/edit", "create/edit", "edit/create"])("serializes concurrent %s normalized collisions", async (kind) => {
  const loc = await location();
  const first = await staffSession(ctx.userId);
  const second = await staffSession(ctx.userId);
  const observer = await pgSession();
  const pid = (await second.query("select pg_backend_pid() pid")).rows[0].pid as number;
  if (kind.startsWith("edit")) await first.query("select public.update_bin($1,$2,$3,$4)", [ctx.breweryId, loc.bins[0].id, "Shared rack", crypto.randomUUID()]);
  else await first.query("select public.create_bin($1,$2,$3,$4)", [ctx.breweryId, loc.id, "Shared rack", crypto.randomUUID()]);
  let settled = false;
  const pending = (kind.endsWith("create")
    ? second.query("select public.create_bin($1,$2,$3,$4)", [ctx.breweryId, loc.id, "SHARED RACK", crypto.randomUUID()])
    : second.query("select public.update_bin($1,$2,$3,$4)", [ctx.breweryId, loc.bins[1].id, "SHARED RACK", crypto.randomUUID()]))
    .then(() => ({ error: null }), (error: Error) => ({ error })).finally(() => { settled = true; });
  await expect.poll(async () => settled || (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock").toBe(true);
  expect(settled, "the second identity write waits for the first transaction").toBe(false);
  await first.query("commit");
  expect((await pending).error?.message).toBe("A bin named Shared rack already exists here");
  await second.query("rollback");
  expect((await runCommand("list_bins", { locationId: loc.id }, ctx) as Bin[]).filter(bin => bin.name.toLowerCase() === "shared rack")).toHaveLength(1);
});

it("serializes rename with deletion of the same bin without resurrecting it", async () => {
  const loc = await location();
  const first = await staffSession(ctx.userId);
  const second = await staffSession(ctx.userId);
  const renamed = await first.query("select public.update_bin($1,$2,$3,$4) result", [ctx.breweryId, loc.bins[0].id, "Renamed rack", crypto.randomUUID()]);
  const pending = second.query("select public.delete_bin($1,$2,$3) result", [ctx.breweryId, loc.bins[0].id, crypto.randomUUID()]);
  await first.query("commit");
  expect((await pending).rows[0].result).toEqual(renamed.rows[0].result);
  await second.query("commit");
  expect((await runCommand("list_bins", { locationId: loc.id }, ctx) as Bin[]).map(bin => bin.id)).not.toContain(loc.bins[0].id);
});

it("refuses a rename after a concurrent deletion commits", async () => {
  const loc = await location();
  const first = await staffSession(ctx.userId);
  const second = await staffSession(ctx.userId);
  await first.query("select public.delete_bin($1,$2,$3)", [ctx.breweryId, loc.bins[0].id, crypto.randomUUID()]);
  const pending = second.query("select public.update_bin($1,$2,$3,$4)", [ctx.breweryId, loc.bins[0].id, "Renamed rack", crypto.randomUUID()])
    .then(() => null, (error: Error) => error);
  await first.query("commit");
  expect((await pending)?.message).toBe("bin not found");
  await second.query("rollback");
  expect((await runCommand("list_bins", { locationId: loc.id }, ctx) as Bin[]).map(bin => bin.id)).not.toContain(loc.bins[0].id);
});

it("renames without waiting for movement's held location read lock", async () => {
  const loc = await location();
  const reader = await pgSession();
  const writer = await staffSession(ctx.userId);
  const observer = await pgSession();
  const pid = (await writer.query("select pg_backend_pid() pid")).rows[0].pid as number;
  await reader.query("begin");
  await reader.query("select id from public.locations where id=$1 for share", [loc.id]);
  let settled = false;
  const pending = writer.query("select public.update_bin($1,$2,$3,$4) result", [ctx.breweryId, loc.bins[0].id, "Renamed beside movement", crypto.randomUUID()])
    .then(result => ({ result, error: null }), (error: Error) => ({ result: null, error })).finally(() => { settled = true; });
  await expect.poll(async () => settled || (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock").toBe(true);
  expect(settled, "a rename must not wait for movement's location read lock").toBe(true);
  expect((await pending).error).toBeNull();
  await writer.query("commit");
  // The reader can now take movement's next bin lock without a lock-order cycle.
  expect((await reader.query("select name from public.bins where id=$1 for share", [loc.bins[0].id])).rows[0].name).toBe("Renamed beside movement");
  await reader.query("commit");
});

import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { DB, admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";

describe("atomic inventory movement previews", () => {
  let breweryId: string;
  let ctx: Ctx;
  let skuId: string;
  let formatId: string;
  let locationId: string;
  let binId: string;

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    ctx = await makeStaffCtx(breweryId, "admin");
    ({ skuId, formatId } = await seedCatalog(breweryId, { product: "Atomic IPA", sku: "Atomic IPA case", bblPerUnit: 0.25 }));
    ({ id: locationId, binId } = await seedLocation(breweryId, { name: "Atomic warehouse" }));
  });

  async function conversation() {
    return await runCommand("create_chat_conversation", {}, ctx, {
      requestId: randomUUID(), correlationId: randomUUID(), origin: "ui",
    }) as { id: string };
  }

  async function preview(conversationId: string, qty = -1) {
    const input = { skuId, locationId, binId, qty, type: "adjustment" as const };
    const result = await runCommand("preview_command", {
      name: "record_movement", input, conversationId,
    }, ctx) as { preview: { previewToken: string; effects: Record<string, unknown>[] } };
    return { input, token: result.preview.previewToken, effects: result.preview.effects };
  }

  it("waits for a sibling writer and atomically rejects the stale preview without partial effects", async () => {
    await runCommand("record_movement", {
      skuId, locationId, binId, qty: 5, type: "opening_balance",
    }, ctx);
    const chat = await conversation();
    const proposal = await preview(chat.id);
    const requestId = randomUUID();
    const writer = new Client({ connectionString: DB });
    await writer.connect();
    let pending: PromiseLike<unknown> | undefined;
    try {
      await writer.query("begin");
      await writer.query("lock table public.inventory_movements in share row exclusive mode");
      await writer.query("select set_config('request.jwt.claim.sub',$1,true)", [ctx.userId]);
      await writer.query("set local role authenticated");
      await writer.query(
        "select public.record_inventory_movement($1,$2,$3,$4,1,'adjustment',null,null,'sibling writer',$5)",
        [breweryId, skuId, locationId, binId, randomUUID()],
      );

      const commit = ctx.db.rpc("record_inventory_movement", {
        p_brewery: breweryId, p_sku: skuId, p_location: locationId, p_bin: binId,
        p_qty: proposal.input.qty, p_type: proposal.input.type, p_sale_channel: null,
        p_dest_state: null, p_note: null, p_lot: null, p_request_id: requestId,
        p_origin: "chat", p_conversation: chat.id, p_preview_token: proposal.token,
      }).then((result) => result);
      pending = commit;

      await expect.poll(() => Number(sql(`select count(*) from pg_locks
        where relation='public.inventory_movements'::regclass
          and mode='ShareRowExclusiveLock' and not granted`)[0])).toBeGreaterThan(0);
      await writer.query("commit");

      const result = await commit;
      expect(result.error?.code).toBe("MG409");
      expect(result.error?.message).toMatch(/preview.*changed|stale preview/i);
      expect(sql(`select count(*) from public.inventory_movements where brewery_id='${breweryId}'`)).toEqual(["2"]);
      expect(sql(`select count(*) from private.command_requests where actor_id='${ctx.userId}' and request_id='${requestId}'`)).toEqual(["0"]);
      expect(sql(`select count(*) from private.chat_messages where actor_id='${ctx.userId}' and request_id='${requestId}'`)).toEqual(["0"]);
    } finally {
      await writer.query("rollback").catch(() => undefined);
      await writer.end();
      if (pending) await pending;
    }
  });

  it("returns canonical selected-stock effects and detects metadata and net-zero ledger changes", async () => {
    const chat = await conversation();
    const proposal = await preview(chat.id, 1);
    expect(proposal.effects).toEqual([
      expect.objectContaining({
        label: "Atomic IPA case · Atomic warehouse · Cold",
        qty: "1",
        bbl: "0.25000000",
        stockBeforeQty: expect.any(String),
        stockAfterQty: expect.any(String),
        correction: "reverse_inventory_movement",
      }),
    ]);

    await admin.from("formats").update({ name: "Renamed case" }).eq("id", formatId);
    const staleMetadata = await ctx.db.rpc("record_inventory_movement", {
      p_brewery: breweryId, p_sku: skuId, p_location: locationId, p_bin: binId,
      p_qty: 1, p_type: "adjustment", p_sale_channel: null, p_dest_state: null, p_note: null,
      p_lot: null, p_request_id: randomUUID(), p_origin: "chat", p_conversation: chat.id,
      p_preview_token: proposal.token,
    });
    expect(staleMetadata.error?.code).toBe("MG409");

    const proposal2 = await preview(chat.id, 1);
    await runCommand("record_movement", { ...proposal2.input, qty: 1 }, ctx);
    await runCommand("record_movement", { ...proposal2.input, qty: -1 }, ctx);
    const staleLedger = await ctx.db.rpc("record_inventory_movement", {
      p_brewery: breweryId, p_sku: skuId, p_location: locationId, p_bin: binId,
      p_qty: 1, p_type: "adjustment", p_sale_channel: null, p_dest_state: null, p_note: null,
      p_lot: null, p_request_id: randomUUID(), p_origin: "chat", p_conversation: chat.id,
      p_preview_token: proposal2.token,
    });
    expect(staleLedger.error?.code).toBe("MG409");
  });

  it("returns the exact committed result after expiry and later stock while conflicting changed retries", async () => {
    const chat = await conversation();
    const proposal = await preview(chat.id, 1);
    const requestId = randomUUID();
    const execution = {
      requestId, correlationId: randomUUID(), origin: "chat" as const,
      conversationId: chat.id, previewToken: proposal.token,
    };
    const first = await runCommand("record_movement", proposal.input, ctx, execution) as { id: string };
    sql(`update private.command_previews set expires_at=now()-interval '1 minute' where token='${proposal.token}'`);
    await runCommand("record_movement", { ...proposal.input, qty: 2 }, ctx);

    await expect(runCommand("record_movement", proposal.input, ctx, execution)).resolves.toEqual(first);
    expect(sql(`select count(*) from public.inventory_movements where id='${first.id}'`)).toEqual(["1"]);
    expect(sql(`select count(*) from private.chat_messages where actor_id='${ctx.userId}' and request_id='${requestId}'`)).toEqual(["1"]);

    await expect(runCommand("record_movement", { ...proposal.input, qty: 2 }, ctx, execution))
      .rejects.toMatchObject({ code: "conflict" });
    const replacement = await preview(chat.id, 1);
    await expect(runCommand("record_movement", proposal.input, ctx, { ...execution, previewToken: replacement.token }))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("rolls back the request and history when the final insert fails", async () => {
    const chat = await conversation();
    const input = { skuId, locationId, binId, qty: 1, type: "adjustment" as const, note: "forced preview failure" };
    const result = await runCommand("preview_command", {
      name: "record_movement", input, conversationId: chat.id,
    }, ctx) as { preview: { previewToken: string } };
    const requestId = randomUUID();
    sql(`create function private.c2_force_insert_failure() returns trigger language plpgsql set search_path='' as $$
      begin if new.note='forced preview failure' then raise exception 'forced insert failure'; end if; return new; end $$;
      create trigger c2_force_insert_failure before insert on public.inventory_movements
        for each row execute function private.c2_force_insert_failure()`);
    try {
      await expect(runCommand("record_movement", input, ctx, {
        requestId, correlationId: randomUUID(), origin: "chat",
        conversationId: chat.id, previewToken: result.preview.previewToken,
      })).rejects.toMatchObject({ message: "forced insert failure" });
      expect(sql(`select count(*) from private.command_requests where actor_id='${ctx.userId}' and request_id='${requestId}'`)).toEqual(["0"]);
      expect(sql(`select count(*) from private.chat_messages where actor_id='${ctx.userId}' and request_id='${requestId}'`)).toEqual(["0"]);
    } finally {
      sql(`drop trigger if exists c2_force_insert_failure on public.inventory_movements;
        drop function if exists private.c2_force_insert_failure()`);
    }
  });

  it("validates preview shape and rechecks current role before any claim", async () => {
    const chat = await conversation();
    const base = {
      p_brewery: breweryId, p_sku: skuId, p_location: locationId, p_bin: binId,
      p_type: "adjustment", p_sale_channel: null, p_dest_state: null, p_note: null,
      p_lot: null, p_conversation: chat.id,
    };
    for (const args of [
      { ...base, p_qty: 1.001 },
      { ...base, p_qty: -1, p_type: "opening_balance" },
      { ...base, p_qty: -1, p_type: "depletion" },
      { ...base, p_qty: -1, p_type: "sample" },
      { ...base, p_qty: 1, p_lot: randomUUID() },
    ]) {
      expect((await ctx.db.rpc("preview_inventory_movement", args)).error).not.toBeNull();
    }

    const proposal = await preview(chat.id, 1);
    const requestId = randomUUID();
    expect((await admin.from("brewery_users").delete().eq("brewery_id", breweryId).eq("user_id", ctx.userId)).error).toBeNull();
    try {
      const denied = await ctx.db.rpc("record_inventory_movement", {
        p_brewery: breweryId, p_sku: skuId, p_location: locationId, p_bin: binId,
        p_qty: 1, p_type: "adjustment", p_sale_channel: null, p_dest_state: null, p_note: null,
        p_lot: null, p_request_id: requestId, p_origin: "chat", p_conversation: chat.id,
        p_preview_token: proposal.token,
      });
      expect(denied.error?.code).toBe("42501");
      expect(sql(`select count(*) from private.command_requests where actor_id='${ctx.userId}' and request_id='${requestId}'`)).toEqual(["0"]);
    } finally {
      await admin.from("brewery_users").insert({ brewery_id: breweryId, user_id: ctx.userId, role: "admin" });
    }
  });
});

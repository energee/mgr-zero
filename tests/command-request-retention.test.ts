// tests/command-request-retention.test.ts — #766 data lifecycle:
// - private.command_requests keeps each write's replay record for 90 days; the
//   prune drops only finished records nothing references (sync history survives).
// - public.close_brewery ends every login's access and stamps closed_at, keeping
//   all records; it refuses while an integration still holds live credentials.
import { describe, expect, it } from "vitest";
import { admin, makeBrewery, makeCustomerUser, makeStaff, seedCustomer, sql } from "./helpers";

describe("command request retention (#766)", () => {
  it("prunes finished records older than 90 days and keeps everything else", async () => {
    const brewery = await makeBrewery();
    const actor = await makeStaff(brewery.id, "admin");
    const put = (age: number, result: string | null) => {
      const id = crypto.randomUUID();
      sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result,created_at)
        values('${actor.id}','${brewery.id}','${id}','test_retention',decode('00','hex'),${result === null ? "null" : `'${result}'`},now() - interval '${age} days')`, true);
      return id;
    };
    const old = put(100, "{}");
    const recent = put(10, "{}");
    const unfinished = put(100, null);
    const referenced = put(100, "{}");
    const connection = sql(`insert into public.qbo_connections(brewery_id,realm_id,state) values('${brewery.id}','realm-${referenced}','connected') returning id`, true)[0];
    sql(`insert into private.qbo_invoice_sync_batches(actor_id,request_id,brewery_id,connection_id,realm_id,targets)
      values('${actor.id}','${referenced}','${brewery.id}','${connection}','realm-${referenced}','[]')`, true);

    sql("select public.prune_command_requests()", true);

    const left = sql(`select request_id from private.command_requests where actor_id='${actor.id}'`, true);
    expect(left.sort()).toEqual([recent, unfinished, referenced].sort());
    expect(left).not.toContain(old);
  });

  it("closes a brewery: access ends, records stay, live integrations refuse", async () => {
    const brewery = await makeBrewery();
    await makeStaff(brewery.id, "admin");
    await makeStaff(brewery.id, "brewer");
    const { customerId } = await seedCustomer(brewery.id);
    await makeCustomerUser(customerId);
    const connection = sql(`insert into public.qbo_connections(brewery_id,realm_id,state) values('${brewery.id}','realm-${brewery.id}','connected') returning id`, true)[0];
    const close = () => sql(`select public.close_brewery('${brewery.id}')`, true);

    expect(close).toThrow(/QuickBooks/);
    expect(sql(`select count(*) from brewery_users where brewery_id='${brewery.id}'`, true)).toEqual(["2"]);

    sql(`update public.qbo_connections set state='disconnected', remote_revocation_state='confirmed' where id='${connection}'`, true);
    close();
    close(); // a second close is a no-op
    expect(sql(`select count(*) from brewery_users where brewery_id='${brewery.id}'`, true)).toEqual(["0"]);
    expect(sql(`select count(*) from customer_users where customer_id='${customerId}'`, true)).toEqual(["0"]);
    expect(sql(`select closed_at is not null from breweries where id='${brewery.id}'`, true)).toEqual(["t"]);
    expect((await admin.from("customers").select("id").eq("id", customerId)).data).toHaveLength(1);
    expect(sql(`select has_function_privilege('authenticated','public.close_brewery(uuid)','execute')`, true)).toEqual(["f"]);
  });
});

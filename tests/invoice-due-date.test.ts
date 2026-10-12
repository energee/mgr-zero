// Invoice issue dates freeze customer terms once, at every insert boundary.
import { beforeAll, expect, it } from "vitest";
import { admin, makeBrewery, seedCustomer, sql } from "./helpers";

let breweryId: string;
let customerId: string;
beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  customerId = (await seedCustomer(breweryId)).customerId;
});

it.each([["due_on_receipt", "2026-09-15"], ["net15", "2026-09-30"], ["net30", "2026-10-15"]])("freezes %s terms from the issue date", async (terms, expected) => {
  expect((await admin.from("customers").update({ payment_terms: terms }).eq("id", customerId)).error).toBeNull();
  const inserted = await admin.from("invoices").insert({ brewery_id: breweryId, customer_id: customerId, issued_on: "2026-09-15" }).select("id,due_on").single();
  expect(inserted.error).toBeNull();
  expect(inserted.data!.due_on).toBe(expected);
  expect((await admin.from("customers").update({ payment_terms: "due_on_receipt" }).eq("id", customerId)).error).toBeNull();
  expect((await admin.from("invoices").select("due_on").eq("id", inserted.data!.id).single()).data!.due_on).toBe(expected);
});

it("preserves explicit due dates and leaves credit memos undated", async () => {
  const explicit = await admin.from("invoices").insert({ brewery_id: breweryId, customer_id: customerId, issued_on: "2026-09-15", due_on: "2026-11-01" }).select("due_on").single();
  expect(explicit.error).toBeNull();
  expect(explicit.data!.due_on).toBe("2026-11-01");
  const credit = await admin.from("invoices").insert({ brewery_id: breweryId, customer_id: customerId, kind: "credit_memo" }).select("due_on").single();
  expect(credit.error).toBeNull();
  expect(credit.data!.due_on).toBeNull();
});

it("uses the issue-date default and keeps both helpers private", async () => {
  const inserted = await admin.from("invoices").insert({ brewery_id: breweryId, customer_id: customerId }).select("issued_on,due_on").single();
  expect(inserted.error).toBeNull();
  expect(inserted.data!.due_on).toBe(inserted.data!.issued_on);
  expect(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('payment_term_days','set_invoice_due_on')", true)).toEqual(["2"]);
  expect(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join unnest(array['anon','authenticated','service_role']) r where n.nspname='private' and p.proname in ('payment_term_days','set_invoice_due_on') and has_function_privilege(r,p.oid,'execute')", true)).toEqual(["0"]);
});

it("backfills only undated invoices from current terms", async () => {
  const { readFileSync } = await import("node:fs");
  const migration = readFileSync(new URL("../supabase/migrations/20261012060200_invoice_due_dates.sql", import.meta.url), "utf8");
  const oldId = crypto.randomUUID(), explicitId = crypto.randomUUID(), creditId = crypto.randomUUID();
  expect(sql(`begin;
    drop trigger invoices_set_due_on on public.invoices;
    drop function private.set_invoice_due_on();
    drop function private.payment_term_days(text);
    update public.customers set payment_terms='net15' where id='${customerId}';
    insert into public.invoices(id,brewery_id,customer_id,issued_on,due_on,kind) values
      ('${oldId}','${breweryId}','${customerId}','2026-09-15',null,'invoice'),
      ('${explicitId}','${breweryId}','${customerId}','2026-09-15','2026-12-01','invoice'),
      ('${creditId}','${breweryId}','${customerId}','2026-09-15',null,'credit_memo');
    ${migration}
    select coalesce(due_on::text,'null') from public.invoices where id='${oldId}';
    select due_on::text from public.invoices where id='${explicitId}';
    select coalesce(due_on::text,'null') from public.invoices where id='${creditId}';
    rollback;`, true)).toEqual(["2026-09-30", "2026-12-01", "null"]);
});

import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCustomer, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Link = { href: string | null; reason: string | null } | null;
async function fixture() {
  const brewery = await makeBrewery(), ctx = await makeStaffCtx(brewery.id, "admin");
  const { customerId } = await seedCustomer(brewery.id);
  const realm = `realm-${crypto.randomUUID()}`;
  const connection = await ins("qbo_connections", { brewery_id: brewery.id, realm_id: realm, state: "connected" });
  const invoice = await ins("invoices", { brewery_id: brewery.id, customer_id: customerId, kind: "invoice", qbo_sync_status: "pushed", qbo_remote_state: "live", qbo_invoice_id: "34", qbo_accountant_drift: true });
  const pushId = crypto.randomUUID();
  sql(`insert into public.qbo_pushes(id,brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,request_body,local_snapshot,attempt_reason,status,qbo_entity_id)
    values('${pushId}','${brewery.id}','${invoice.id}','${connection.id}','${realm}','Invoice','${crypto.randomUUID()}','{"notForClient":"private-request"}','{}','initial','pushed','34')`);
  return { brewery, ctx, realm, connection, invoice, pushId };
}
async function detail(f: Awaited<ReturnType<typeof fixture>>) {
  return await runCommand("get_invoice", { invoiceId: f.invoice.id }, f.ctx) as { quickbooksLink: Link };
}

describe("staff invoice link query boundaries", () => {
  it("projects the verified destination in detail and list without exposing provider request data", async () => {
    const f = await fixture();
    const d = await detail(f);
    expect(d.quickbooksLink?.href).toBe(`https://app.qbo.intuit.com/app/invoice?txnId=34&companyId=${f.realm}`);
    const list = await runCommand("list_invoices", {}, f.ctx) as { id: string; quickbooks_link: Link }[];
    expect(list.find(row => row.id === f.invoice.id)?.quickbooks_link).toEqual(d.quickbooksLink);
    expect(JSON.stringify([d, list])).not.toContain("private-request");
    const sales = await makeStaffCtx(f.brewery.id, "sales");
    expect((await runCommand("get_invoice", { invoiceId: f.invoice.id }, sales) as { quickbooksLink: Link }).quickbooksLink).toEqual(d.quickbooksLink);
  });
  it.each(["realm", "reconnect", "remote", "missing push", "disconnected", "deleted", "unpushed", "credit memo", "non-Invoice push", "pending push"])("refuses %s", async state => {
    const f = await fixture();
    if (state === "realm") await admin.from("qbo_connections").update({ realm_id: `other-${crypto.randomUUID()}` }).eq("id", f.connection.id).throwOnError();
    if (state === "reconnect") {
      await admin.from("qbo_connections").delete().eq("id", f.connection.id).throwOnError();
      await ins("qbo_connections", { brewery_id: f.brewery.id, realm_id: f.realm, state: "connected" });
    }
    if (state === "non-Invoice push") sql(`update public.qbo_pushes set entity_type='CreditMemo' where id='${f.pushId}'`);
    if (state === "pending push") sql(`update public.qbo_pushes set status='pending' where id='${f.pushId}'`);
    if (state === "remote") await admin.from("invoices").update({ qbo_invoice_id: "different" }).eq("id", f.invoice.id).throwOnError();
    if (state === "missing push") sql(`delete from public.qbo_pushes where id='${f.pushId}'`);
    if (state === "disconnected") await admin.from("qbo_connections").update({ state: "disconnected" }).eq("id", f.connection.id).throwOnError();
    if (state === "deleted") await admin.from("invoices").update({ qbo_remote_state: "deleted" }).eq("id", f.invoice.id).throwOnError();
    if (state === "unpushed") await admin.from("invoices").update({ qbo_sync_status: "pending" }).eq("id", f.invoice.id).throwOnError();
    if (state === "credit memo") await admin.from("invoices").update({ kind: "credit_memo" }).eq("id", f.invoice.id).throwOnError();
    expect((await detail(f)).quickbooksLink).toMatchObject({ href: null, reason: expect.any(String) });
  });
  it("does not return financial links for warehouse or another selected brewery", async () => {
    const f = await fixture(), warehouse = await makeStaffCtx(f.brewery.id, "warehouse");
    const result = await runCommand("get_invoice", { invoiceId: f.invoice.id }, warehouse) as { quickbooksLink: Link };
    expect(result.quickbooksLink).toBeNull();
    const other = await makeBrewery();
    await ins("brewery_users", { brewery_id: other.id, user_id: f.ctx.userId, role: "admin" });
    await expect(runCommand("get_invoice", { invoiceId: f.invoice.id }, { ...f.ctx, breweryId: other.id })).rejects.toThrow();
    const list = await runCommand("list_invoices", {}, { ...f.ctx, breweryId: other.id }) as unknown[];
    expect(list).toEqual([]);
    const brewer = await makeStaffCtx(f.brewery.id, "brewer");
    await expect(runCommand("get_invoice", { invoiceId: f.invoice.id }, brewer)).rejects.toThrow(/permission denied/i);
  });
});

import { describe, expect, it } from "vitest";
import { qboStaffInvoiceLink } from "@/lib/mgr/qbo-ui";

const invoice = { kind: "invoice" as const, qbo_sync_status: "pushed" as const, qbo_remote_state: "live" as const, qbo_invoice_id: "34" };
const connection = { connected: true, connectionId: "connection", realmId: "4620000000000000" };
const push = { connection_id: "connection", realm_id: "4620000000000000", qbo_entity_id: "34" };

describe("verified staff QuickBooks invoice destination", () => {
  it("uses the official company-bound destination for Admin and Sales", () => {
    for (const role of ["admin", "sales"] as const) expect(qboStaffInvoiceLink(invoice, role, connection, push)).toEqual({ href: "https://app.qbo.intuit.com/app/invoice?txnId=34&companyId=4620000000000000", reason: null });
  });
  it("does not expose the link to other roles", () => {
    for (const role of ["warehouse", "brewer", "taproom", "customer"] as const) expect(qboStaffInvoiceLink(invoice, role, connection, push)).toBeNull();
  });
  it("refuses mismatched invoice, realm and reconnected identity", () => {
    for (const mismatch of [{ ...push, realm_id: "other" }, { ...push, connection_id: "old" }, { ...push, qbo_entity_id: "different" }]) {
      expect(qboStaffInvoiceLink(invoice, "admin", connection, mismatch)).toMatchObject({ href: null, reason: expect.stringMatching(/identity|company/i) });
    }
  });
  it("explains disconnected, unpushed, deleted, unsupported and missing identities", () => {
    expect(qboStaffInvoiceLink(invoice, "admin", { ...connection, connected: false }, push)).toMatchObject({ href: null, reason: expect.stringMatching(/connect/i) });
    expect(qboStaffInvoiceLink({ ...invoice, qbo_sync_status: "pending" }, "admin", connection, push)).toMatchObject({ href: null, reason: expect.stringMatching(/pushed/i) });
    expect(qboStaffInvoiceLink({ ...invoice, qbo_remote_state: "deleted" }, "admin", connection, push)).toMatchObject({ href: null, reason: expect.stringMatching(/deleted/i) });
    expect(qboStaffInvoiceLink({ ...invoice, kind: "credit_memo" }, "admin", connection, push)).toMatchObject({ href: null, reason: expect.stringMatching(/credit memo/i) });
    expect(qboStaffInvoiceLink({ ...invoice, qbo_invoice_id: null }, "admin", connection, push)).toMatchObject({ href: null });
    expect(qboStaffInvoiceLink(invoice, "admin", connection, undefined)).toMatchObject({ href: null });
  });
  it("encodes identifiers as query values instead of accepting a supplied destination", () => {
    const id = "34&companyId=other";
    const link = qboStaffInvoiceLink({ ...invoice, qbo_invoice_id: id }, "admin", connection, { ...push, qbo_entity_id: id });
    const url = new URL(link!.href!);
    expect(url.origin).toBe("https://app.qbo.intuit.com");
    expect(url.searchParams.get("txnId")).toBe(id);
    expect(url.searchParams.getAll("companyId")).toEqual([connection.realmId]);
  });
});

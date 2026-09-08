// tests/invoice-questions.test.ts — Program 10 task 8: a portal buyer asks
// about an invoice (raise_invoice_question), the question lands on the sales
// Today list, Mark answered (resolve_invoice_question) clears it, and another
// customer never sees it.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, seedCustomer } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import type { TodayItem } from "@/lib/commands/today";
import "@/lib/commands/all";

let b: { id: string }, sales: Ctx, warehouse: Ctx, buyer: Ctx, other: Ctx, invoiceId: string;

async function customerCtx(customerId: string): Promise<Ctx> {
  const u = await makeCustomerUser(customerId);
  return { db: await asUser(u.email), userId: u.id, breweryId: b.id, role: "customer", customerId };
}

beforeAll(async () => {
  b = await makeBrewery();
  [sales, warehouse] = await Promise.all([makeStaffCtx(b.id, "sales"), makeStaffCtx(b.id, "warehouse")]);
  const mine = await seedCustomer(b.id, { name: "Ridgeline" });
  const theirs = await seedCustomer(b.id, { name: "Other Bar" });
  [buyer, other] = await Promise.all([customerCtx(mine.customerId), customerCtx(theirs.customerId)]);
  invoiceId = (await admin.from("invoices").insert({ brewery_id: b.id, customer_id: mine.customerId, kind: "invoice" }).select().single()).data!.id;
});

describe("invoice questions", () => {
  it("a buyer raises one on their own invoice only, and a missing invoice reads the same as a foreign one", async () => {
    await expect(runCommand("raise_invoice_question", { invoiceId, body: "The Pils count looks short." }, other)).rejects.toThrow(/permission denied/);
    // enumeration: an id that matches nothing must not be distinguishable from someone else's
    await expect(runCommand("raise_invoice_question", { invoiceId: crypto.randomUUID(), body: "x" }, buyer)).rejects.toThrow(/permission denied/);
    const q = await runCommand("raise_invoice_question", { invoiceId, body: "The Pils count looks short." }, buyer) as { id: string; invoice_id: string };
    expect(q.invoice_id).toBe(invoiceId);
    await expect(runCommand("raise_invoice_question", { invoiceId, body: "x" }, sales)).rejects.toThrow(/permission denied/);
  });

  it("lands on the sales Today list and clears when marked answered", async () => {
    const before = await runCommand("get_today", {}, sales) as TodayItem[];
    const row = before.find((i) => i.reason === "invoice_question");
    expect(row).toMatchObject({ subjectType: "invoice", href: `/invoices/${invoiceId}` });
    expect((await runCommand("get_today", {}, warehouse) as TodayItem[]).some((i) => i.reason === "invoice_question")).toBe(false);

    const open = await runCommand("list_invoice_questions", {}, sales) as { id: string; answered_at: string | null; body: string }[];
    expect(open.map((q) => q.body)).toContain("The Pils count looks short.");
    await expect(runCommand("resolve_invoice_question", { questionId: open[0].id }, warehouse)).rejects.toThrow(/permission denied/);
    await runCommand("resolve_invoice_question", { questionId: open[0].id }, sales);
    expect((await runCommand("get_today", {}, sales) as TodayItem[]).some((i) => i.reason === "invoice_question")).toBe(false);
    expect((await runCommand("list_invoice_questions", { invoiceId }, sales) as { answered_at: string | null }[])[0].answered_at).not.toBeNull();
  });

  it("two open questions on one invoice are two rows with their own identities", async () => {
    await runCommand("raise_invoice_question", { invoiceId, body: "And the delivery date?" }, buyer);
    await runCommand("raise_invoice_question", { invoiceId, body: "Is the deposit included?" }, buyer);
    const rows = (await runCommand("get_today", {}, sales) as TodayItem[]).filter((i) => i.reason === "invoice_question");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.subjectId)).size).toBe(2);
    expect(rows.every((r) => r.href === `/invoices/${invoiceId}`)).toBe(true);
  });

  it("another customer cannot read it", async () => {
    const { data } = await other.db.from("invoice_questions").select("id").eq("invoice_id", invoiceId);
    expect(data).toEqual([]);
    const { data: mine } = await buyer.db.from("invoice_questions").select("id, customer_id").eq("invoice_id", invoiceId);
    expect(mine?.length).toBeGreaterThan(0);
    expect(mine?.every((q) => q.customer_id === buyer.customerId)).toBe(true);
  });
});

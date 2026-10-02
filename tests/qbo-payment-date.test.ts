// QBO payment observations must not claim an invoice edit is a settlement date.
import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/integration-tokens", () => ({}));
import { QboOAuthClient } from "@/lib/qbo";

const payment = (id: string, amount: number, date?: string) => ({
  Id: id, TotalAmt: amount, UnappliedAmt: 0, TxnDate: date,
  Line: [{ Amount: amount, LinkedTxn: [{ TxnType: "Invoice", TxnId: "invoice" }] }],
});

it.each([
  { name: "final cash payment before an unrelated invoice edit", balance: 0, payments: [payment("one", 100, "2026-09-09")], cash: 10000 },
  { name: "partial payment", balance: 60, payments: [payment("one", 40, "2026-09-09")], cash: 4000 },
  { name: "multiple partial and final payments", balance: 0, payments: [payment("one", 40, "2026-09-09"), payment("two", 60, "2026-09-11")], cash: 10000 },
  { name: "credit-only closure", balance: 0, payments: [payment("credit", 0, "2026-09-09")], cash: 0 },
  { name: "cash payment without a transaction date", balance: 0, payments: [payment("one", 100)], cash: 10000 },
])("does not invent a payment date for $name", async ({ balance, payments, cash }) => {
  const transport = vi.fn<typeof fetch>(async (url) => {
    const id = new URL(String(url)).pathname.split("/").at(-1);
    const body = id === "invoice" ? { Invoice: {
      Id: "invoice", SyncToken: "1", TotalAmt: 100, Balance: balance,
      MetaData: { LastUpdatedTime: "2026-09-12T00:30:00-07:00" },
      LinkedTxn: payments.map(p => ({ TxnType: "Payment", TxnId: p.Id })),
    } } : { Payment: payments.find(p => p.Id === id) };
    return new Response(JSON.stringify(body));
  });
  const client = new QboOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri: "https://example.test", apiBaseUrl: "https://example.test" }, transport);
  expect(await client.readInvoice("realm", "invoice", "token")).toMatchObject({
    ok: true, balanceCents: balance * 100, cashCollectedCents: cash, paidAt: null,
  });
});

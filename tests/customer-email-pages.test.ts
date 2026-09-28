import { expect, it, vi } from "vitest";
const calls = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/brewery", () => ({ requireAdminContext: async () => ({ brewery: { timeZone: "UTC" }, ctx: { breweryId: "brewery", role: "admin" } }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: async (name: string) => {
  calls.push(name);
  if (name === "get_qbo_connection") return { connected: false, state: "disconnected", realmLabel: null, lastError: null };
  if (name === "count_customers_missing_portal_email") return 3;
  if (name === "get_qbo_sync_status") return { latest: null, lastSuccess: null, latestFailure: null, retryRequestId: null };
  throw new Error(name);
} }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/qbo", () => ({ isQboConfigured: () => false }));
import AccountingPage from "@/app/(app)/settings/accounting/page";
import { AccountingView } from "@/components/mgr/views/accounting";
it("supplies the authorized missing-email count and filtered destination to the shared accounting view", async () => {
  const page = await AccountingPage({ searchParams: Promise.resolve({}) });
  expect(page.type).toBe(AccountingView);
  expect(calls).toContain("count_customers_missing_portal_email");
  expect(page.props.model.missingEmails).toBe(3);
  expect(page.props.model.customersHref).toBe("/customers?missingEmail=1");
});

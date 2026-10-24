// The command schema preserves historical names until SQL checks durable replay.
// SQL then trims and rejects blank new writes; commands-customers proves both.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/customers";

const customerInput = getCommandDefinition("upsert_customer")!.input;
const account = { type: "retailer", state: "PA", saleChannelId: "00000000-0000-4000-8000-000000000001" };

describe("customer raw request identity (#1306)", () => {
  it.each(["   ", "\t\r\n", "\u00a0\u2003", " \tGreen Bar\n "])("preserves historical name bytes %j until the RPC replay check", name => {
    expect(customerInput.parse({ ...account, name, alias: "Local account", paymentTerms: "net15", taxTreatment: "export" })).toEqual({
      ...account, country: "US", name, alias: "Local account", paymentTerms: "net15", taxTreatment: "export",
    });
  });

  it("still rejects the empty name that the historical command schema refused", () => {
    const result = customerInput.safeParse({ ...account, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path)).toContainEqual(["name"]);
  });
});

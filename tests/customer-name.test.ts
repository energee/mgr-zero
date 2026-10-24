// Customer names must be trimmed and nonblank before the command handler runs.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/customers";

const customerInput = getCommandDefinition("upsert_customer")!.input;
const account = { type: "retailer", state: "PA", saleChannelId: "00000000-0000-4000-8000-000000000001" };

describe("customer name command boundary (#1306)", () => {
  it.each(["", "   ", "\t\r\n", "\u00a0\u2003"])("refuses a blank name %j", name => {
    const result = customerInput.safeParse({ ...account, name });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path)).toContainEqual(["name"]);
  });

  it("trims a name without changing the alias or other customer fields", () => {
    expect(customerInput.parse({ ...account, name: " \tGreen Bar\n ", alias: "Local account", paymentTerms: "net15", taxTreatment: "export" })).toEqual({
      ...account, country: "US", name: "Green Bar", alias: "Local account", paymentTerms: "net15", taxTreatment: "export",
    });
  });
});

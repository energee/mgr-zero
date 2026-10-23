// tests/pos-square-connected.test.ts — get_square_connected (#1083): Warehouse,
// who cannot read pos_connections, learns only whether this brewery's Square
// seller is connected, so Menu can tell a disconnected Square from an
// unmapped location. Nothing else about the connection leaves the database.
import { beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";

async function squareConnection(breweryId: string, state: "connected" | "disconnected") {
  const row = await admin.from("pos_connections").insert({
    brewery_id: breweryId, merchant_id: `merchant-${crypto.randomUUID()}`, merchant_label: "Sample Seller",
    state, credential_version: 1, last_error: "secret-detail",
  }).select("id").single();
  expect(row.error).toBeNull();
}

describe("get_square_connected", () => {
  let connected: { id: string };
  let disconnected: { id: string };
  let none: { id: string };
  beforeAll(async () => {
    [connected, disconnected, none] = await Promise.all([makeBrewery(), makeBrewery(), makeBrewery()]);
    await Promise.all([squareConnection(connected.id, "connected"), squareConnection(disconnected.id, "disconnected")]);
  });

  it("gives Warehouse the boolean and nothing else", async () => {
    const warehouse = await makeStaffCtx(connected.id, "warehouse");
    expect(await runCommand("get_square_connected", {}, warehouse)).toEqual({ connected: true });
  });

  it("is false after a disconnect and when Square was never connected", async () => {
    expect(await runCommand("get_square_connected", {}, await makeStaffCtx(disconnected.id, "warehouse"))).toEqual({ connected: false });
    expect(await runCommand("get_square_connected", {}, await makeStaffCtx(none.id, "admin"))).toEqual({ connected: false });
  });

  it("answers only for the caller's own brewery", async () => {
    const outsider = await makeStaffCtx(none.id, "warehouse");
    const { data, error } = await outsider.db.rpc("get_square_connected", { p_brewery: connected.id });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("is refused to a role that cannot open Menu", async () => {
    await expect(runCommand("get_square_connected", {}, await makeStaffCtx(connected.id, "brewer"))).rejects.toThrow();
  });
});

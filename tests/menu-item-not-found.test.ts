// tests/menu-item-not-found.test.ts — a stale menu item link renders the
// not-found route, not the error boundary or a blank page (#425).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/commands/registry";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

const FORMAT = "00000000-0000-4000-8000-000000000000";

function ctxRaising(message: string): Ctx {
  const db = { rpc: () => Promise.resolve({ data: null, error: { code: "P0001", message } }) };
  return { db, userId: FORMAT, breweryId: FORMAT, role: "warehouse" } as unknown as Ctx;
}

describe("get_pos_menu_item on a stale link", () => {
  for (const message of ["Menu item not found", "Menu is not configured"]) {
    it(`"${message}" is 404 not_found`, async () => {
      await expect(runCommand("get_pos_menu_item", { posLocationId: "L1", formatId: FORMAT }, ctxRaising(message)))
        .rejects.toMatchObject({ status: 404, code: "not_found", message });
    });
  }

  it("other domain errors keep their 400", async () => {
    await expect(runCommand("get_pos_menu_item", { posLocationId: "L1", formatId: FORMAT }, ctxRaising("something else")))
      .rejects.toMatchObject({ status: 400, code: "bad_request" });
  });

  it("the page calls notFound() when no Square location is mapped", () => {
    const page = readFileSync("app/(app)/menu/item/[formatId]/page.tsx", "utf8");
    expect(page).toMatch(/if \(!location\) notFound\(\);/);
  });
});

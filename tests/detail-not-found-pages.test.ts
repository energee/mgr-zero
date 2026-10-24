// Exercise the actual detail pages at their query boundary: malformed/missing
// records become Next 404s, while unrelated failures keep their original identity.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/registry";
import type * as ContextModule from "@/lib/commands/context";
import type * as RegistryModule from "@/lib/commands/registry";

const state = vi.hoisted(() => ({
  query: vi.fn<(name: string) => Promise<unknown>>(),
  context: vi.fn(async () => ({ roles: ["admin"] })),
}));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", roles: ["admin"] }) }));
vi.mock("@/lib/commands/context", async (original) => ({
  ...await original<typeof ContextModule>(),
  buildContext: state.context,
}));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: state.query }));
vi.mock("@/lib/commands/registry", async (original) => ({
  ...await original<typeof RegistryModule>(),
  breweryToday: async () => "2026-10-24",
}));

import BatchPage from "@/app/(app)/batches/[id]/page";
import RoutePage from "@/app/(app)/routes/[id]/page";
import CustomerPage from "@/app/(app)/customers/[id]/page";

const missingId = "afffffff-ffff-4fff-8fff-ffffffffffff";
const pages = [
  { name: "Batches", read: "get_brew_day", open: (id: string) => BatchPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }) },
  { name: "Routes", read: "list_routes", open: (id: string) => RoutePage({ params: Promise.resolve({ id }) }) },
  { name: "Customers", read: "get_customer", open: (id: string) => CustomerPage({ params: Promise.resolve({ id }) }) },
];

beforeEach(() => {
  state.query.mockReset();
  state.context.mockClear();
});

for (const page of pages) {
  describe(`${page.name} detail not-found boundary`, () => {
    it("rejects malformed ids before requesting any record data", async () => {
      state.query.mockRejectedValue(new CommandError("invalid uuid", 400, "invalid_input"));
      await expect(page.open("bogus")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      expect(state.query).not.toHaveBeenCalled();
      expect(state.context).not.toHaveBeenCalled();
    });

    it("renders not found for a valid but missing id", async () => {
      const started = Promise.withResolvers<void>();
      const primary = Promise.withResolvers<void>();
      state.query.mockImplementation(async name => {
        if (name === page.read) {
          // Hold the primary read while an incorrectly eager dependent RPC fails.
          started.resolve();
          await primary.promise;
          if (name === "list_routes") return { routes: [] };
          throw new CommandError("record not found", 404, "not_found");
        }
        if (name === "get_brew_day_plan" || name === "get_brew_record") throw new CommandError("batch not found");
        return [];
      });
      const result = expect(page.open(missingId)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      await started.promise;
      primary.resolve();
      await result;
      if (page.name === "Batches") expect(state.query.mock.calls.map(([name]) => name)).toEqual(["get_brew_day"]);
    });

    it.each([
      new Error("unexpected failure"),
      new CommandError("database unavailable", 500, "db_error"),
      new CommandError("permission denied", 403, "forbidden"),
    ])("preserves unexpected and access failures: %s", async failure => {
      state.query.mockRejectedValue(failure);
      await expect(page.open(missingId)).rejects.toBe(failure);
    });

    if (page.name !== "Routes") {
      it("preserves failures from supporting reads after finding the record", async () => {
        const failure = new CommandError("supporting read unavailable", 500, "db_error");
        state.query.mockImplementation(async name => {
          if (name === page.read) return page.name === "Batches" ? { batch: {}, occupancy: null } : { customer: {}, shipTos: [] };
          throw failure;
        });
        await expect(page.open(missingId)).rejects.toBe(failure);
      });
    }
  });
}

// Pure test: the Square publish start helpers map database errors the same way
// every other command does (#461), so raw Postgres text never reaches the caller
// and a transient failure is not reported as a definitive 400.
import { describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/commands/registry";
import { beginSquareMenuPublication, beginSquarePublication } from "@/lib/supabase/integration-tokens";

const ctxFailing = (error: { message: string; code?: string }) => ({
  breweryId: "brewery-1", userId: "user-1", role: "admin",
  db: { rpc: vi.fn().mockResolvedValue({ data: null, error }) },
}) as unknown as Ctx;

const starts = [
  ["beginSquarePublication", (ctx: Ctx) => beginSquarePublication(ctx, { posLocationId: "L1", brandId: "b1" }, "req-1", "publish_pos_item")],
  ["beginSquareMenuPublication", (ctx: Ctx) => beginSquareMenuPublication(ctx, { posLocationId: "L1" }, "req-1")],
] as const;

describe.each(starts)("%s database errors", (_name, start) => {
  it("hides raw Postgres text behind a retryable 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const raw = 'duplicate key value violates unique constraint "square_publication_attempts_pkey"';
    const failure = start(ctxFailing({ message: raw, code: "23505" }));
    await expect(failure).rejects.toMatchObject({ status: 500, code: "db_error", message: "database error" });
  });

  it("keeps conflicts, permission denials, and raised business rules", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(start(ctxFailing({ message: "menu changed", code: "MG409" })))
      .rejects.toMatchObject({ status: 409, code: "conflict", message: "menu changed" });
    await expect(start(ctxFailing({ message: "role missing", code: "42501" })))
      .rejects.toMatchObject({ status: 403, code: "permission_denied", message: "permission denied" });
    await expect(start(ctxFailing({ message: "location is not mapped", code: "P0001" })))
      .rejects.toMatchObject({ status: 400, message: "location is not mapped" });
  });
});

// tests/migration-order.test.ts — lib/migration-order.ts, the pure half of
// scripts/check-migration-order.ts (CI and land-pr.sh run the CLI).
import { describe, expect, it } from "vitest";
import { outOfOrder } from "@/lib/migration-order";

const MAIN = ["20260928220600_b.sql", "20261016101000_us_ship_to_state_only.sql", "20261001000000_a.sql"];

describe("outOfOrder", () => {
  it("accepts added migrations newer than every migration on main", () => {
    expect(outOfOrder(MAIN, ["20261016101001_next.sql", "20261020000000_later.sql"])).toEqual([]);
  });

  it("flags an added migration older than main's newest", () => {
    expect(outOfOrder(MAIN, ["20261010000000_late.sql", "20261020000000_ok.sql"])).toEqual(["20261010000000_late.sql"]);
  });

  it("flags an added migration with the same timestamp as main's newest", () => {
    expect(outOfOrder(MAIN, ["20261016101000_clash.sql"])).toEqual(["20261016101000_clash.sql"]);
  });

  it("accepts anything when main has no migrations, and nothing added", () => {
    expect(outOfOrder([], ["20200101000000_first.sql"])).toEqual([]);
    expect(outOfOrder(MAIN, [])).toEqual([]);
  });

  it("reads bare file names and supabase/migrations paths alike", () => {
    expect(outOfOrder(["supabase/migrations/20261016101000_x.sql"], ["supabase/migrations/20261001000000_y.sql"]))
      .toEqual(["supabase/migrations/20261001000000_y.sql"]);
  });
});

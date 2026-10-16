// Gates branch identity diagnostics without querying or resetting a database.
import { describe, expect, it } from "vitest";
import { expectedMigration, assertMigration, assertIdentity, localEnvironment, stripIdentityTypes } from "../scripts/test-db-schema.mjs";

describe("test database schema guard", () => {
  it("refuses missing local configuration instead of inherited app settings", () => {
    expect(() => localEnvironment(`missing-test-env-${crypto.randomUUID()}`)).toThrow("Run scripts/test-db.sh before local tests");
  });

  it("chooses the newest migration prefix, not directory order or unrelated files", () => {
    expect(expectedMigration(["20261016125525_new_rpc.sql", "README", "00001_baseline.sql", "20261015120000_old.sql"])).toBe("20261016125525");
    expect(() => expectedMigration([])).toThrow("no local migrations");
  });

  it("names actual and expected migrations with the recovery command", () => {
    expect(() => assertMigration("20261016125525", "20261015120000")).toThrow(
      "test db is at 20261015120000, this worktree expects 20261016125525; run MGR_TEST_DB_RESET=1 bash scripts/test-db.sh or use an isolated 5436x stack",
    );
    expect(() => assertMigration("20261016125525", null)).toThrow("test db is at <missing>");
    expect(() => assertMigration("20261016125525", "20261016125525")).not.toThrow();
  });

  it("rejects an endpoint mismatch or replacement even at the same migration", () => {
    const expected = { version: "20261016125525", fingerprint: "mgr-schema branch-a", reset: "run-a" };
    expect(() => assertIdentity(expected, { ...expected })).not.toThrow();
    for (const actual of [null, { ...expected, fingerprint: "mgr-schema branch-b" }, { ...expected, reset: "run-b" }]) {
      expect(() => assertIdentity(expected, actual)).toThrow(/expected[\s\S]*run-a[\s\S]*actual/);
    }
  });

  it("removes only readiness RPC signatures from generated application types", async () => {
    const probe = `mgr_test_identity_${"a".repeat(32)}`;
    const source = `export type Database = {
  public: {
    Tables: { example: { Row: { ${probe}: string } } }
    Functions: {
      real_rpc: { Args: never; Returns: string }
      "${probe}": { Args: never; Returns: Json },
      mgr_test_identity_business: { Args: never; Returns: string }
    }
  }
}`;
    const expected = source.replace(`\n      "${probe}": { Args: never; Returns: Json },`, "");
    expect(await stripIdentityTypes(source)).toBe(expected);
    expect(await stripIdentityTypes(expected)).toBe(expected);
  });
});

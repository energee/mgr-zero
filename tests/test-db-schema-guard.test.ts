// Gates branch identity diagnostics without querying or resetting a database.
import { readFileSync } from "node:fs";
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

  it("canonicalizes whitespace-only generated lines without changing view metadata", async () => {
    const prefix = `export type Database = {
  public: {
    Views: { atp: { Row: { qty: number | null }; Relationships: [`;
    const suffix = `    ] } }
    Functions: {}
  }
}
`;
    const generated = `${prefix}\n${" ".repeat(20)}\n\t \t\n${suffix}`;
    const expected = `${prefix}\n\n\n${suffix}`;
    expect(await stripIdentityTypes(generated)).toBe(expected);
    expect(await stripIdentityTypes(expected)).toBe(expected);
  });

  // A plain psql apply records neither migration history nor the identity this
  // guard checks, so land-pr's database tests would always fail the guard.
  it("lands PRs against a test-db.sh build held under the exclusive lock", () => {
    const landPr = readFileSync("scripts/land-pr.sh", "utf8");
    expect(landPr).not.toMatch(/\bpsql\b/);
    const proof = landPr.indexOf("perl scripts/test-db-lock.pl ex bash -c 'bash scripts/test-db.sh --locked-reset");
    expect(proof).toBeGreaterThan(-1);
    expect(landPr.indexOf("node_modules/.bin/vitest run", proof)).toBeGreaterThan(proof);
  });
});

// Production already applied 00001; QBO schema changes must also exist in a forward migration.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("QBO production migration", () => {
  it("upgrades an existing baseline database", () => {
    const name = readdirSync("supabase/migrations").find((file) => file.endsWith("_deploy_current_schema.sql"));
    expect(name).toBeDefined();
    const sql = readFileSync(`supabase/migrations/${name}`, "utf8");
    expect(sql).toContain('ALTER TABLE "public"."skus"\n  ADD COLUMN "qbo_realm_id" text;');
    expect(sql).toContain('CREATE TABLE "public"."qbo_pushes"');
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.begin_qbo_oauth");
  });
});

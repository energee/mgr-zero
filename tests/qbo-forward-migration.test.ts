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

  it("carries composer schema changes outside the already-applied baseline", () => {
    const name = readdirSync("supabase/migrations").find((file) => file.endsWith("_deploy_current_schema.sql"));
    expect(name).toBeDefined();
    const sql = readFileSync(`supabase/migrations/${name}`, "utf8");
    const baseline = readFileSync("supabase/migrations/00001_baseline.sql", "utf8");
    expect(baseline).not.toContain("create table private.chat_conversations");
    expect(sql).toContain('CREATE TABLE "private"."chat_conversations"');
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.preview_inventory_movement");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.record_inventory_movement");
  });
});

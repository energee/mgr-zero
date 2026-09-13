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

  // The composer landed after 20260910120847 had already been pushed, so its
  // schema has to arrive in a migration hosted has not applied yet — which is
  // any file sorting after that version. It was edited into the applied file
  // instead, which is what left Ask MGR dead on live (#329).
  it("carries composer schema changes in a migration hosted has not applied", () => {
    const applied = ["00001_baseline.sql", "20260910120847_deploy_current_schema.sql"];
    const forward = readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql") && !applied.includes(file))
      .map((file) => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n");
    for (const sql of applied.map((file) => readFileSync(`supabase/migrations/${file}`, "utf8"))) {
      expect(sql).not.toContain('CREATE TABLE "private"."chat_conversations"');
      expect(sql).not.toContain("create table private.chat_conversations");
    }
    expect(forward).toContain('CREATE TABLE "private"."chat_conversations"');
    expect(forward).toContain("CREATE OR REPLACE FUNCTION public.preview_inventory_movement");
    expect(forward).toContain("CREATE OR REPLACE FUNCTION public.record_inventory_movement");
  });
});

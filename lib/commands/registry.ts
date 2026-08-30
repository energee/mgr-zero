// lib/commands/registry.ts — single source of truth for every operation.
// UI calls these via /api/command; AI chat (plan 1C) exposes the same registry as tools.
import { ZodType } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = "admin" | "sales" | "warehouse";
export type Ctx = { db: SupabaseClient; userId: string; breweryId: string; role: StaffRole | "customer" };

type Def<In, Out> = {
  name: string;
  description?: string;
  input: ZodType<In>;
  roles: StaffRole[] | "customer" | "any";
  requiresConfirmation?: boolean;
  handler: (ctx: Ctx, input: In) => Promise<Out>;
};

const registry = new Map<string, Def<any, any>>();

export function defineCommand<In, Out>(def: Def<In, Out>) {
  if (registry.has(def.name)) throw new Error(`duplicate command: ${def.name}`);
  registry.set(def.name, def);
  return def;
}
export const defineQuery = defineCommand;

export async function runCommand(name: string, rawInput: unknown, ctx: Ctx) {
  const def = registry.get(name);
  if (!def) throw new Error(`unknown command: ${name}`);
  const allowed = def.roles === "any" || (def.roles === "customer" ? ctx.role === "customer" : def.roles.includes(ctx.role as StaffRole));
  if (!allowed) throw new Error(`permission denied: ${name} requires ${JSON.stringify(def.roles)}`);
  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) throw new Error(`validation failed: ${parsed.error.message}`);
  return def.handler(ctx, parsed.data);
}

export function listTools() {
  return [...registry.values()].map(d => ({ name: d.name, description: d.description ?? "", inputSchema: d.input, requiresConfirmation: !!d.requiresConfirmation }));
}
export function _clearRegistry() { registry.clear(); } // tests only

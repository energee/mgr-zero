// lib/commands/registry.ts — single source of truth for every operation.
// UI calls these via /api/command; AI chat (plan 1C) exposes the same registry as tools.
import { ZodType } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = "admin" | "sales" | "warehouse";
export type Ctx = { db: SupabaseClient; userId: string; breweryId: string; role: StaffRole | "customer" };

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

// Awaits a Supabase query and turns its { data, error } into data-or-throw,
// so handlers don't each repeat `if (error) throw new CommandError(...)`.
// Postgres errors (CHECK, FK, RLS) are user-facing by design here: they are
// the ledger's validation messages.
export async function unwrap<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new CommandError(error.message);
  return data;
}

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
  if (registry.has(def.name)) throw new CommandError(`duplicate command: ${def.name}`);
  registry.set(def.name, def);
  return def;
}
export const defineQuery = defineCommand;

export async function runCommand(name: string, rawInput: unknown, ctx: Ctx) {
  const def = registry.get(name);
  if (!def) throw new CommandError(`unknown command: ${name}`);
  const allowed = def.roles === "any" || (def.roles === "customer" ? ctx.role === "customer" : def.roles.includes(ctx.role as StaffRole));
  if (!allowed) throw new CommandError(`permission denied: ${name} requires ${JSON.stringify(def.roles)}`);
  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) throw new CommandError(`validation failed: ${parsed.error.message}`);
  try {
    return await def.handler(ctx, parsed.data);
  } catch (e: unknown) {
    if (e instanceof CommandError) throw e;
    console.error(`handler error in ${name}:`, e);
    throw e;
  }
}

export function listTools() {
  // inputSchema is a Zod object for same-process use (API clients see the schema structure)
  return [...registry.values()].map(d => ({ name: d.name, description: d.description ?? "", inputSchema: d.input, requiresConfirmation: !!d.requiresConfirmation }));
}
export function _clearRegistry() { registry.clear(); } // tests only

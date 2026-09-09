// lib/commands/registry.ts — single source of truth for every operation.
// UI calls these via /api/command; AI chat (plan 1C) exposes the same registry as tools.
import { z, ZodType } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = "admin" | "sales" | "warehouse" | "brewer" | "taproom";
/** Every staff role: the `roles` of a read that all of staff may run. */
export const STAFF_ROLES: StaffRole[] = ["admin", "sales", "warehouse", "brewer", "taproom"];
export type PreTenantCtx = { db: SupabaseClient; userId: string; breweryId: null; role: null };
export type OperationCtx = Ctx | PreTenantCtx;
export type Ctx = { db: SupabaseClient; userId: string; breweryId: string; role: StaffRole | "customer"; customerId?: string };

/** Distinguishes side-effect-free reads from write operations that require idempotency metadata. */
export type OperationKind = "query" | "command";

/** Correlates one write request with its transport and downstream work. */
export type CommandExecution = {
  requestId: string;
  correlationId: string;
};

export type PublicError = {
  code: string;
  message: string;
};

export type CommandSuccess<T> = {
  ok: true;
  data: T;
  requestId?: string;
  correlationId: string;
};

export type CommandFailure = {
  ok: false;
  error: PublicError;
  requestId?: string;
  correlationId: string;
};

/** The JSON body accepted by POST /api/command; only commands require requestId. */
export type CommandRequest = {
  breweryId?: string;
  name: string;
  input: unknown;
  requestId?: string;
};

export class CommandError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "bad_request") {
    super(message);
    this.name = "CommandError";
  }
}

// Awaits a Supabase query and turns its { data, error } into data-or-throw,
// so handlers don't each repeat `if (error) throw new CommandError(...)`.
// This is the one place database errors become public: see rpcError.
export async function unwrap<T>(query: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw rpcError(error);
  return data;
}

/** unwrap for a list read; supabase-js without generated types cannot say what the rows are, so the caller names T. */
export const rows = <T,>(q: Parameters<typeof unwrap>[0]) => unwrap(q) as unknown as Promise<T[]>;

/** Today (YYYY-MM-DD) in the brewery's own timezone, not the server's UTC day: what a date field defaults to. */
export async function breweryToday(ctx: Ctx): Promise<string> {
  const { timezone } = (await unwrap(ctx.db.from("staff_brewery").select("timezone").eq("id", ctx.breweryId).single())) as { timezone: string };
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/** A two-letter US state code, the shape customers.state, ship_tos.state and the registry tables check. */
export const stateCode = z.string().regex(/^[A-Z]{2}$/, "two-letter state code");

// Maps a Supabase/PostgREST error to the public CommandError envelope. P0001 is
// `raise exception` without an errcode, i.e. the domain rules our own RPCs
// raise, so its message is the user-facing one. Anything unlisted is logged
// here and surfaces as a generic 500 so raw Postgres text never reaches a
// client (security audit A2); detail pages turn not_found into the not-found
// route (lib/mgr/not-found.ts).
function rpcError(error: { message: string; code?: string }): CommandError {
  switch (error.code) {
    case "42501": return new CommandError(error.message, 403, "permission_denied");
    case "MG409": return new CommandError(error.message, 409, "conflict");
    case "PGRST116": return new CommandError("record not found", 404, "not_found");
    case "P0001": return new CommandError(error.message);
    default:
      console.error(`database error ${error.code ?? "unknown"}:`, error.message);
      return new CommandError("database error", 500, "db_error");
  }
}

type DefinitionBase<In> = {
  name: string;
  description?: string;
  input: ZodType<In>;
  roles: StaffRole[] | "customer" | "any";
  requiresConfirmation?: boolean;
};

export type CommandDefinition<In, Out> = DefinitionBase<In> & {
  kind: "command";
  handler: (ctx: Ctx, input: In, execution: CommandExecution) => Promise<Out>;
};

export type QueryDefinition<In, Out> = DefinitionBase<In> & {
  kind: "query";
  handler: (ctx: Ctx, input: In) => Promise<Out>;
};

type CommandDefinitionInput<In, Out> = Omit<CommandDefinition<In, Out>, "kind">;
type QueryDefinitionInput<In, Out> = Omit<QueryDefinition<In, Out>, "kind">;

export type CommandDefinitionMetadata = Pick<
  CommandDefinition<unknown, unknown> | QueryDefinition<unknown, unknown>,
  "name" | "description" | "input" | "roles" | "requiresConfirmation" | "kind"
> & { scope: "tenant" | "pretenant" };

type StoredDefinition = CommandDefinitionMetadata & {
  execute: (ctx: OperationCtx, input: unknown, execution?: CommandExecution) => Promise<unknown>;
};

const registry = new Map<string, StoredDefinition>();

function requireUnusedName(name: string) {
  if (registry.has(name)) throw new CommandError(`duplicate command: ${name}`, 400, "duplicate_command");
}

function assertTenantCtx(ctx: OperationCtx): asserts ctx is Ctx {
  if (ctx.breweryId === null) throw new CommandError("brewery context required", 403, "permission_denied");
}

export function defineCommand<In, Out>(input: CommandDefinitionInput<In, Out>): CommandDefinition<In, Out> {
  requireUnusedName(input.name);
  const definition: CommandDefinition<In, Out> = { ...input, kind: "command" };
  registry.set(definition.name, {
    ...definition,
    scope: "tenant",
    execute: (ctx, parsed, execution) => {
      assertTenantCtx(ctx);
      const typedInput = parsed as In; // Parsed by this definition's Zod schema immediately before execution.
      if (!execution) throw new CommandError("command execution metadata is required", 500, "missing_execution");
      return definition.handler(ctx, typedInput, execution);
    },
  });
  return definition;
}

export function defineQuery<In, Out>(input: QueryDefinitionInput<In, Out>): QueryDefinition<In, Out> {
  requireUnusedName(input.name);
  const definition: QueryDefinition<In, Out> = { ...input, kind: "query" };
  registry.set(definition.name, {
    ...definition,
    scope: "tenant",
    execute: (ctx, parsed) => {
      assertTenantCtx(ctx);
      const typedInput = parsed as In; // Parsed by this definition's Zod schema immediately before execution.
      return definition.handler(ctx, typedInput);
    },
  });
  return definition;
}

/** The sole bootstrap operation accepts authenticated identity without a tenant role. */
export function definePreTenantCommand<In, Out>(definition: {
  name: "provision_brewery";
  description: string;
  input: ZodType<In>;
  handler: (ctx: PreTenantCtx, input: In, execution: CommandExecution) => Promise<Out>;
}) {
  requireUnusedName(definition.name);
  registry.set(definition.name, {
    ...definition, kind: "command", scope: "pretenant", roles: "any",
    execute: (ctx, parsed, execution) => {
      if (ctx.breweryId !== null) throw new CommandError("pre-tenant context required", 403, "permission_denied");
      if (!execution) throw new CommandError("command execution metadata is required", 500, "missing_execution");
      return definition.handler(ctx, parsed as In, execution);
    },
  });
}

/** Returns registration metadata without parsing input or invoking the operation handler. */
export function getCommandDefinition(name: string): CommandDefinitionMetadata | undefined {
  const definition = registry.get(name);
  if (!definition) return undefined;
  return {
    name: definition.name,
    description: definition.description,
    input: definition.input,
    roles: definition.roles,
    requiresConfirmation: definition.requiresConfirmation,
    kind: definition.kind,
    scope: definition.scope,
  };
}

function createExecution(): CommandExecution {
  return { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
}

/**
 * Whether `ctx`'s role may run `name` at all — the same check runCommand makes,
 * for a handler that composes optional reads (the Work landing skips the areas
 * its caller may not open) instead of refusing outright. One rule, one place.
 */
export function canRun(ctx: OperationCtx, name: string): boolean {
  const def = registry.get(name);
  if (!def) return false;
  if (def.scope === "pretenant") return ctx.breweryId === null;
  if (ctx.breweryId === null) return false;
  return def.roles === "any" || (def.roles === "customer" ? ctx.role === "customer" : def.roles.includes(ctx.role as StaffRole));
}

// Output is unknown: a string name cannot carry the handler's type; callers narrow.
export async function runCommand(name: string, rawInput: unknown, ctx: OperationCtx, execution?: CommandExecution): Promise<unknown> {
  const def = registry.get(name);
  if (!def) throw new CommandError(`unknown command: ${name}`, 404, "unknown_command");
  const allowed = canRun(ctx, name);
  if (!allowed) throw new CommandError(`permission denied: ${name} requires ${JSON.stringify(def.roles)}`, 403, "permission_denied");
  const parsed = def.input.safeParse(rawInput);
  // prettifyError gives one readable line per issue ("✖ Invalid UUID → at
  // customerId") for forms, the portal cart and HTTP API callers alike, instead
  // of the serialized issue array zod puts in error.message.
  if (!parsed.success) throw new CommandError(`validation failed: ${z.prettifyError(parsed.error)}`, 400, "invalid_input");
  try {
    return await def.execute(ctx, parsed.data, def.kind === "command" ? execution ?? createExecution() : undefined);
  } catch (e: unknown) {
    if (e instanceof CommandError) throw e;
    console.error(`handler error in ${name}:`, e);
    throw e;
  }
}

export function listTools() {
  // inputSchema is a Zod object for same-process use (API clients see the schema structure)
  return [...registry.values()].map(d => ({
    name: d.name,
    description: d.description ?? "",
    inputSchema: d.input,
    kind: d.kind,
    scope: d.scope,
    requiresConfirmation: !!d.requiresConfirmation,
  }));
}

export function _clearRegistry() { registry.clear(); } // tests only

// lib/commands/registry.ts — single source of truth for every operation.
// UI calls these via /api/command; AI chat (plan 1C) exposes the same registry as tools.
import { z, ZodType } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = "admin" | "sales" | "warehouse" | "brewer";
/** Every staff role: the `roles` of a read that all of staff may run. */
export const STAFF_ROLES: StaffRole[] = ["admin", "sales", "warehouse", "brewer"];
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
  breweryId: string;
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
>;

type StoredDefinition = CommandDefinitionMetadata & {
  execute: (ctx: Ctx, input: unknown, execution?: CommandExecution) => Promise<unknown>;
};

const registry = new Map<string, StoredDefinition>();

function requireUnusedName(name: string) {
  if (registry.has(name)) throw new CommandError(`duplicate command: ${name}`, 400, "duplicate_command");
}

export function defineCommand<In, Out>(input: CommandDefinitionInput<In, Out>): CommandDefinition<In, Out> {
  requireUnusedName(input.name);
  const definition: CommandDefinition<In, Out> = { ...input, kind: "command" };
  registry.set(definition.name, {
    ...definition,
    execute: (ctx, parsed, execution) => {
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
    execute: (ctx, parsed) => {
      const typedInput = parsed as In; // Parsed by this definition's Zod schema immediately before execution.
      return definition.handler(ctx, typedInput);
    },
  });
  return definition;
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
  };
}

function createExecution(): CommandExecution {
  return { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
}

// Output is unknown: a string name cannot carry the handler's type; callers narrow.
export async function runCommand(name: string, rawInput: unknown, ctx: Ctx, execution?: CommandExecution): Promise<unknown> {
  const def = registry.get(name);
  if (!def) throw new CommandError(`unknown command: ${name}`, 404, "unknown_command");
  const allowed = def.roles === "any" || (def.roles === "customer" ? ctx.role === "customer" : def.roles.includes(ctx.role as StaffRole));
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
    requiresConfirmation: !!d.requiresConfirmation,
  }));
}

export function _clearRegistry() { registry.clear(); } // tests only

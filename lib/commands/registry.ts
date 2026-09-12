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
export type CommandOrigin = "ui" | "chat";
export type CommandRisk = "mutable" | "append_only" | "immutable" | "filed" | "external" | "destructive_local";
export type CommandIdempotency = "dedupe" | "online_only";
export type CommandAtomicity = "single_row" | "rpc" | "atomic_exempt_csv" | "external_intent";
export type CommandPreview = { effects: { label: string; qty?: string }[]; warnings: string[]; version: unknown; previewToken?: string };

/** Correlates one write request with its transport and downstream work. */
export type CommandExecution = {
  requestId: string;
  correlationId: string;
  origin?: CommandOrigin;
  conversationId?: string;
  previewToken?: string;
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
  expectedContext?: CommandContextExpectation;
  origin?: CommandOrigin;
  conversationId?: string;
  previewToken?: string;
};

export type CommandContextExpectation = {
  actorId: string;
  breweryId?: string;
  customerId?: string;
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
    case "42501":
      console.error("database error 42501:", error.message);
      return new CommandError("permission denied", 403, "permission_denied");
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
  aiExposed?: boolean;
};

export type CommandDefinition<In, Out> = DefinitionBase<In> & {
  kind: "command";
  risk?: CommandRisk;
  compensation?: string | null;
  idempotency?: CommandIdempotency;
  offlineReplay?: boolean;
  atomicity?: CommandAtomicity;
  preview?: (ctx: Ctx, input: In, conversationId: string) => Promise<CommandPreview>;
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
> & {
  scope: "tenant" | "pretenant";
  aiExposed: boolean;
  risk?: CommandRisk;
  compensation?: string | null;
  idempotency?: CommandIdempotency;
  offlineReplay: boolean;
  atomicity?: CommandAtomicity;
  preview?: (ctx: Ctx, input: unknown, conversationId: string) => Promise<CommandPreview>;
};

type StoredDefinition = CommandDefinitionMetadata & {
  execute: (ctx: OperationCtx, input: unknown, execution?: CommandExecution) => Promise<unknown>;
};

const registry = new Map<string, StoredDefinition>();

function requireUnusedName(name: string) {
  if (registry.has(name) && process.env.NODE_ENV !== "development") throw new CommandError(`duplicate command: ${name}`, 400, "duplicate_command");
}

function assertTenantCtx(ctx: OperationCtx): asserts ctx is Ctx {
  if (ctx.breweryId === null) throw new CommandError("brewery context required", 403, "permission_denied");
}

export function defineCommand<In, Out>(input: CommandDefinitionInput<In, Out>): CommandDefinition<In, Out> {
  requireUnusedName(input.name);
  if (input.aiExposed && !input.preview) throw new CommandError("AI-exposed commands require a preview hook", 400, "invalid_command_metadata");
  if (input.aiExposed && input.requiresConfirmation !== true) throw new CommandError("AI-exposed commands require confirmation", 400, "invalid_command_metadata");
  if (input.offlineReplay && input.idempotency !== "dedupe") throw new CommandError("offline replay requires durable dedupe", 400, "invalid_command_metadata");
  const definition: CommandDefinition<In, Out> = {
    risk: "mutable", compensation: null, idempotency: "online_only", offlineReplay: false, atomicity: "rpc",
    ...input, aiExposed: input.aiExposed ?? false, kind: "command",
  };
  registry.set(definition.name, {
    ...definition,
    aiExposed: definition.aiExposed ?? false,
    offlineReplay: definition.offlineReplay ?? false,
    preview: definition.preview as StoredDefinition["preview"],
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
  const definition: QueryDefinition<In, Out> = { ...input, aiExposed: input.aiExposed ?? false, kind: "query" };
  registry.set(definition.name, {
    ...definition,
    aiExposed: definition.aiExposed ?? false,
    offlineReplay: false,
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
    ...definition, kind: "command", scope: "pretenant", roles: "any", aiExposed: false, offlineReplay: false,
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
    aiExposed: definition.aiExposed,
    risk: definition.risk,
    compensation: definition.compensation,
    idempotency: definition.idempotency,
    offlineReplay: definition.offlineReplay,
    atomicity: definition.atomicity,
    preview: definition.preview,
    kind: definition.kind,
    scope: definition.scope,
  };
}

function createExecution(): CommandExecution {
  return { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID(), origin: "ui" };
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

/** Canonicalizes one candidate with its registered schema and preview hook without invoking its write handler. */
export async function previewCommand(name: string, rawInput: unknown, ctx: Ctx, conversationId: string) {
  const def = registry.get(name);
  if (!def || def.kind !== "command" || !def.preview) return { valid: false, allowed: false, preview: null };
  if (!canRun(ctx, name)) return { valid: true, allowed: false, preview: null };
  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) return { valid: false, allowed: true, preview: null, errors: parsed.error.issues.map((issue) => issue.message) };
  return { valid: true, allowed: true, name, input: parsed.data, preview: await def.preview(ctx, parsed.data, conversationId) };
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
  const commandExecution = def.kind === "command" ? execution ?? createExecution() : undefined;
  if (commandExecution?.origin === "chat" && (!def.aiExposed || !def.preview || !def.requiresConfirmation
    || !commandExecution.previewToken || !commandExecution.conversationId)) {
    throw new CommandError("chat commands require a confirmed preview", 400, "preview_required");
  }
  try {
    return await def.execute(ctx, parsed.data, commandExecution);
  } catch (e: unknown) {
    if (e instanceof CommandError) throw e;
    console.error(`handler error in ${name}:`, e);
    throw e;
  }
}

export function listTools(options: { aiOnly?: boolean; ctx?: OperationCtx } = {}) {
  // inputSchema is a Zod object for same-process use (API clients see the schema structure)
  return [...registry.values()].filter((d) => {
    if (!options.aiOnly) return true;
    if (!options.ctx || !d.aiExposed || !canRun(options.ctx, d.name)) return false;
    return options.ctx.role !== "customer" || d.name.startsWith("portal_");
  }).map(d => ({
    name: d.name,
    description: d.description ?? "",
    inputSchema: d.input,
    kind: d.kind,
    scope: d.scope,
    requiresConfirmation: !!d.requiresConfirmation,
    aiExposed: d.aiExposed,
    risk: d.risk,
    compensation: d.compensation,
    idempotency: d.idempotency,
    offlineReplay: d.offlineReplay,
    atomicity: d.atomicity,
  }));
}

export function _clearRegistry() { registry.clear(); } // tests only

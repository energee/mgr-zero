// app/api/command/route.ts — the typed HTTP command/query endpoint.
// Commands require client-provided UUID request IDs; queries only receive a
// server-generated correlation ID. Unexpected errors are logged and returned
// as a generic 500; database errors are sanitized in registry.ts (unwrap).
import { NextResponse } from "next/server";
import { consumeAdmission } from "@/lib/commands/admission";
import { buildContextFromBearer, buildRouteContext, isUuid } from "@/lib/commands/context";
import {
  type CommandContextExpectation,
  type CommandExecution,
  type CommandFailure,
  type CommandRequest,
  type CommandSuccess,
  CommandError,
  getCommandDefinition,
  runCommand,
} from "@/lib/commands/registry";
import { z } from "zod";
import "@/lib/commands/all"; // side-effect: registers every command
import { MAX_COMMAND_BODY_BYTES } from "@/lib/commands/request-limits";
import { readBoundedJson } from "@/lib/request-json";

// null = no Authorization header (use the cookie session); "" = a header that
// is present but malformed, which must fail closed as 401 rather than fall
// back to cookies — keep the null/"" distinction.
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token, extra] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer" || !token || extra) return "";
  return token;
}

function isCommandRequest(body: unknown): body is CommandRequest {
  return typeof body === "object"
    && body !== null
    && (("breweryId" in body && typeof body.breweryId === "string")
      || (!("breweryId" in body) && "name" in body && typeof body.name === "string"
        && getCommandDefinition(body.name)?.scope === "pretenant"))
    && "name" in body
    && typeof body.name === "string"
    && "input" in body;
}

const expectedContextSchema = z.object({
  actorId: z.uuid(),
  breweryId: z.uuid().optional(),
  customerId: z.uuid().optional(),
}).strict();

const provenanceSchema = z.object({
  origin: z.enum(["ui", "chat"]).default("ui"),
  conversationId: z.uuid().optional(),
  previewToken: z.uuid().optional(),
}).refine((value) => value.origin === "chat"
  ? Boolean(value.conversationId && value.previewToken)
  : !value.conversationId && !value.previewToken, {
  message: "chat commands require a confirmed preview",
});


export async function POST(req: Request) {
  const correlationId = crypto.randomUUID();
  let requestId: string | undefined;

  try {
    const body: unknown = await readBoundedJson(req, MAX_COMMAND_BODY_BYTES);
    if (!isCommandRequest(body)) {
      throw new CommandError("invalid command request", 400, "invalid_request");
    }
    requestId = typeof body.requestId === "string" ? body.requestId : undefined;
    let expectedContext: CommandContextExpectation | undefined;
    if ("expectedContext" in body) {
      const parsed = expectedContextSchema.safeParse(body.expectedContext);
      if (!parsed.success) throw new CommandError("invalid expected context", 400, "invalid_request");
      expectedContext = parsed.data;
    }

    const definition = getCommandDefinition(body.name);
    if (!definition) {
      throw new CommandError(`unknown command: ${body.name}`, 404, "unknown_command");
    }
    let execution: CommandExecution | undefined;
    if (definition.kind === "command") {
      if (!isUuid(requestId)) {
        throw new CommandError("requestId must be a UUID for commands", 400, "invalid_request_id");
      }
      const provenance = provenanceSchema.safeParse({
        origin: "origin" in body ? body.origin : undefined,
        conversationId: "conversationId" in body ? body.conversationId : undefined,
        previewToken: "previewToken" in body ? body.previewToken : undefined,
      });
      if (!provenance.success) throw new CommandError("chat commands require a confirmed preview", 400, "preview_required");
      execution = { requestId, correlationId, ...provenance.data };
    }

    if (definition.scope === "pretenant" && body.breweryId !== undefined) {
      throw new CommandError("omit breweryId for this command", 400, "invalid_request");
    }
    const token = bearerToken(req);
    const ctx = token === null
      ? await buildRouteContext(body.breweryId, expectedContext)
      : await buildContextFromBearer(body.breweryId, token, expectedContext);
    const admission = await consumeAdmission(ctx.db);
    if (!admission.allowed) {
      const response: CommandFailure = {
        ok: false, error: { code: "rate_limited", message: "too many requests" },
        ...(requestId === undefined ? {} : { requestId }), correlationId,
      };
      return NextResponse.json(response, { status: 429, headers: { "Retry-After": String(admission.retryAfter) } });
    }
    const response: CommandSuccess<unknown> = {
      ok: true,
      data: await runCommand(body.name, body.input, ctx, execution),
      ...(execution ? { requestId: execution.requestId } : {}),
      correlationId,
    };
    return NextResponse.json(response);
  } catch (e: unknown) {
    if (e instanceof CommandError) {
      const response: CommandFailure = {
        ok: false,
        error: { code: e.code, message: e.message },
        ...(requestId === undefined ? {} : { requestId }),
        correlationId,
      };
      return NextResponse.json(response, { status: e.status });
    }
    console.error("internal error:", e instanceof Error ? e.message : e);
    const response: CommandFailure = {
      ok: false,
      error: { code: "internal_error", message: "internal error" },
      ...(requestId === undefined ? {} : { requestId }),
      correlationId,
    };
    return NextResponse.json(response, { status: 500 });
  }
}

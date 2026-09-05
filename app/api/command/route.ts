// app/api/command/route.ts — the typed HTTP command/query endpoint.
// Commands require client-provided UUID request IDs; queries only receive a
// server-generated correlation ID. Unexpected errors are logged and returned
// as a generic 500; database errors are sanitized in registry.ts (unwrap).
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildContextFromBearer, buildRouteContext } from "@/lib/commands/context";
import {
  type CommandExecution,
  type CommandFailure,
  type CommandRequest,
  type CommandSuccess,
  CommandError,
  getCommandDefinition,
  runCommand,
} from "@/lib/commands/registry";
import "@/lib/commands/all"; // side-effect: registers every command

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
    && "breweryId" in body
    && typeof body.breweryId === "string"
    && "name" in body
    && typeof body.name === "string"
    && "input" in body;
}

const requestIdSchema = z.uuid();

function isUuid(value: string | undefined): value is string {
  return value !== undefined && requestIdSchema.safeParse(value).success;
}


export async function POST(req: Request) {
  const correlationId = crypto.randomUUID();
  let requestId: string | undefined;

  try {
    const body: unknown = await req.json().catch(() => {
      throw new CommandError("request body must be JSON", 400, "invalid_request");
    });
    if (!isCommandRequest(body)) {
      throw new CommandError("invalid command request", 400, "invalid_request");
    }
    requestId = typeof body.requestId === "string" ? body.requestId : undefined;

    const definition = getCommandDefinition(body.name);
    if (!definition) {
      throw new CommandError(`unknown command: ${body.name}`, 404, "unknown_command");
    }
    let execution: CommandExecution | undefined;
    if (definition.kind === "command") {
      if (!isUuid(requestId)) {
        throw new CommandError("requestId must be a UUID for commands", 400, "invalid_request_id");
      }
      execution = { requestId, correlationId };
    }

    const token = bearerToken(req);
    const ctx = token === null
      ? await buildRouteContext(body.breweryId)
      : await buildContextFromBearer(body.breweryId, token);
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

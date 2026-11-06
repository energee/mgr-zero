// lib/commands/agent-sessions.ts — an Admin's read of what models did in MGR. Hidden from
// models, because a session's notes are text a model wrote.
import { z } from "zod";
import { CommandError, completeRows, defineQuery, PAGE_SIZE, unwrap } from "@/lib/commands/registry";

defineQuery({
  name: "list_agent_sessions", agentHidden: true,
  description: "The latest sessions of outside agents and Ask MGR at this brewery",
  input: z.object({}),
  roles: ["admin"],
  handler: (ctx) => unwrap(ctx.db.rpc("list_agent_sessions", { p_brewery: ctx.breweryId })),
});

defineQuery({
  name: "get_agent_session", agentHidden: true,
  description: "One session's steps and notes",
  input: z.object({ sessionId: z.uuid().describe("The session, from list_agent_sessions") }),
  roles: ["admin"],
  handler: async (ctx, { sessionId }) => {
    const [session] = await unwrap(ctx.db.rpc("list_agent_sessions", { p_brewery: ctx.breweryId, p_session: sessionId })) as Record<string, unknown>[];
    if (!session) throw new CommandError("No such session.", 404, "not_found");
    const [stepRows, noteRows] = await Promise.all([
      completeRows("Session steps", start => ctx.db.from("agent_session_steps")
        .select("id, tool, operation, outcome, error_code, input_path", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("session_id", sessionId).order("created_at").order("id").range(start, start + PAGE_SIZE - 1)),
      completeRows("Session notes", start => ctx.db.from("agent_session_notes")
        .select("id, kind, body", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("session_id", sessionId).order("created_at").order("id").range(start, start + PAGE_SIZE - 1)),
    ]);
    return { ...session, stepRows, noteRows };
  },
});

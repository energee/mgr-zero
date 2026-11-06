// app/api/mcp/route.ts — the MCP endpoint for outside agents. Thin by design:
// lib/agent/mcp-tools.ts owns the tools, and the command registry owns the rest.
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { AGENT_INSTRUCTIONS, registerAgentTools, verifyAgentToken } from "@/lib/agent/mcp-tools";
import "@/lib/commands/all";

const handler = withMcpAuth(createMcpHandler(registerAgentTools, { instructions: AGENT_INSTRUCTIONS, serverInfo: { name: "MGR", version: "1.0.0" } }), verifyAgentToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { handler as GET, handler as POST };

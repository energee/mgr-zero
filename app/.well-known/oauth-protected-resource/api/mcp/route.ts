// app/.well-known/oauth-protected-resource/api/mcp/route.ts — tells an MCP client
// where to sign in for /api/mcp (RFC 9728). Supabase Auth is the authorization server.
import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { publicEnv } from "@/lib/env/public";

export function GET(request: Request) {
  return protectedResourceHandler({
    authServerUrls: [`${publicEnv.supabaseUrl}/auth/v1`],
    resourceUrl: `${getPublicOrigin(request)}/api/mcp`,
  })(request);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

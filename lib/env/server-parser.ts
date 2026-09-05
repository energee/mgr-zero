// lib/env/server-parser.ts — parses server configuration for server code, scripts, and tests.
// Server-only contract: SUPABASE_SECRET_KEY plus the public values, and an
// optional VERCEL_ENV. Rate limiting on /api/command is not yet implemented
// (see docs/audits/2026-09-01-authz-audit.md A1), so no HMAC secret lives here.
import { readPublicEnv, type PublicEnv } from "./public";

export interface ServerEnv extends PublicEnv {
  supabaseSecretKey: string;
  vercelEnv?: "production" | "preview" | "development";
}

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function readServerEnv(env: Environment = process.env): ServerEnv {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production" && vercelEnv !== "preview" && vercelEnv !== "development") {
    throw new Error("Invalid environment variable: VERCEL_ENV");
  }

  const supabaseSecretKey = required(env, "SUPABASE_SECRET_KEY");

  return {
    ...readPublicEnv(env),
    supabaseSecretKey,
    vercelEnv: vercelEnv as ServerEnv["vercelEnv"],
  };
}

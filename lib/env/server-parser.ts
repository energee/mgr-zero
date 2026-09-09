// lib/env/server-parser.ts — parses server configuration for server code, scripts, and tests.
// Server-only contract: SUPABASE_SECRET_KEY plus the public values, and an
// optional VERCEL_ENV. Command admission is keyed by the verified Auth user in
// Postgres and needs no caller-address or HMAC configuration here.
import { readPublicEnv, type PublicEnv } from "./public";

export interface ServerEnv extends PublicEnv {
  supabaseSecretKey: string;
  dedicated: boolean;
  vercelEnv?: "production" | "preview" | "development";
}

export interface QboEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function readQboEnv(env: Environment = process.env): QboEnv {
  return {
    clientId: required(env, "QBO_CLIENT_ID"),
    clientSecret: required(env, "QBO_CLIENT_SECRET"),
    redirectUri: required(env, "QBO_REDIRECT_URI"),
  };
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
    dedicated: env.MGR_DEDICATED === "1",
    vercelEnv: vercelEnv as ServerEnv["vercelEnv"],
  };
}

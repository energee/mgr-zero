// lib/env/server-parser.ts — parses server configuration for server code, scripts, and tests.
import { readPublicEnv, type PublicEnv } from "./public";

export interface ServerEnv extends PublicEnv {
  supabaseSecretKey: string;
  commandRateLimitHmacSecret: string;
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
  const commandRateLimitHmacSecret = required(env, "COMMAND_RATE_LIMIT_HMAC_SECRET");
  if (commandRateLimitHmacSecret.length < 32) {
    throw new Error("Invalid environment variable: COMMAND_RATE_LIMIT_HMAC_SECRET must be at least 32 characters");
  }

  return {
    ...readPublicEnv(env),
    supabaseSecretKey,
    commandRateLimitHmacSecret,
    vercelEnv: vercelEnv as ServerEnv["vercelEnv"],
  };
}

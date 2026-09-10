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
  apiBaseUrl: string;
  taxApiBaseUrl?: string;
}

export interface SquareEnv {
  applicationId: string;
  applicationSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
}

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function readQboEnv(env: Environment = process.env): QboEnv {
  const taxApiBaseUrl = env.QBO_TAX_API_BASE?.trim();
  return {
    clientId: required(env, "QBO_CLIENT_ID"),
    clientSecret: required(env, "QBO_CLIENT_SECRET"),
    redirectUri: required(env, "QBO_REDIRECT_URI"),
    apiBaseUrl: required(env, "QBO_API_BASE"),
    ...(taxApiBaseUrl ? { taxApiBaseUrl } : {}),
  };
}

export function readSquareEnv(env: Environment = process.env): SquareEnv {
  const environment = required(env, "SQUARE_ENVIRONMENT");
  if (environment !== "sandbox" && environment !== "production") throw new Error("Invalid environment variable: SQUARE_ENVIRONMENT");
  return {
    applicationId: required(env, "SQUARE_APPLICATION_ID"),
    applicationSecret: required(env, "SQUARE_APPLICATION_SECRET"),
    redirectUri: required(env, "SQUARE_REDIRECT_URI"),
    environment,
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

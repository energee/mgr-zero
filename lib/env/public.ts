// lib/env/public.ts — validates the only Supabase configuration permitted in browser bundles.
export interface PublicEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validUrl(value: string, name: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString().replace(/\/$/, "");
  } catch {
    // The error below names the invalid variable without leaking its value.
  }
  throw new Error(`Invalid environment variable: ${name}`);
}

export function readPublicEnv(env: Environment = process.env): PublicEnv {
  return {
    supabaseUrl: validUrl(required(env, "NEXT_PUBLIC_SUPABASE_URL"), "NEXT_PUBLIC_SUPABASE_URL"),
    supabasePublishableKey: required(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

// Next only inlines direct `process.env.NEXT_PUBLIC_*` references in browser bundles.
export const publicEnv = readPublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

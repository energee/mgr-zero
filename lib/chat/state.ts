// lib/chat/state.ts — restricted Postgres pool and Chat SDK state singleton.
// CHAT_STATE_DATABASE_URL must authenticate as a login member of mgr_chat_sdk:
// the role may CREATE only inside private schema chat_sdk and cannot read
// tenant data (proved by tests/chat-state-adapter.test.ts).
import pg from "pg";
import { createPostgresState } from "@chat-adapter/state-pg";

const FORBIDDEN_USERS = new Set(["postgres", "supabase_admin", "anon", "authenticated", "service_role"]);

export function chatStateUrl(): string {
  const raw = process.env.CHAT_STATE_DATABASE_URL;
  if (!raw) throw new Error("CHAT_STATE_DATABASE_URL is not configured");
  const url = new URL(raw);
  if (FORBIDDEN_USERS.has(decodeURIComponent(url.username))) {
    throw new Error("CHAT_STATE_DATABASE_URL must use the dedicated mgr_chat_sdk login, not a Supabase owner role");
  }
  return raw;
}

let pool: pg.Pool | undefined;
let state: ReturnType<typeof createPostgresState> | undefined;

function chatConnectionConfig(): pg.ClientConfig {
  const url = new URL(chatStateUrl());
  const ca = process.env.CHAT_STATE_DATABASE_CA;
  if (ca) {
    // pg lets URL SSL options override the explicit CA configuration.
    for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(), options: "-c search_path=chat_sdk", connectionTimeoutMillis: 5000,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  };
}

export function chatStatePool(): pg.Pool {
  pool ??= new pg.Pool({ ...chatConnectionConfig(), max: 5 });
  return pool;
}

// Advisory-lock holders must not reserve an SDK pool slot while their work
// waits for another slot to read/write credentials.
export function chatLifecycleClient() {
  return new pg.Client(chatConnectionConfig());
}

export function chatState() {
  state ??= createPostgresState({ client: chatStatePool(), keyPrefix: process.env.CHAT_STATE_KEY_PREFIX ?? "mgr" });
  return state;
}

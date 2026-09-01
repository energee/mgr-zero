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

export function chatStatePool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: chatStateUrl(), options: "-c search_path=chat_sdk", max: 5 });
  return pool;
}

export function chatState() {
  state ??= createPostgresState({ client: chatStatePool(), keyPrefix: process.env.CHAT_STATE_KEY_PREFIX ?? "mgr" });
  return state;
}

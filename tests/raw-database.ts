import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

// Negative database tests intentionally send missing fields, private relation
// names, and catalog-discovered RPC arguments. Keep that escape test-only and
// return unknown fields: a malformed request never gives us trusted row types.
type RawSchema = {
  Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: [] }>;
  Views: Record<string, never>;
  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
};
type RawDatabase = { public: RawSchema; private: RawSchema };

export function rawDatabase(db: SupabaseClient<Database>): SupabaseClient<RawDatabase> {
  return db as unknown as SupabaseClient<RawDatabase>;
}

import { parseEnv } from "node:util";

/** Local tests must never inherit the app stack's credentials or endpoints.
 * @param {Record<string, string>} loaded
 * @param {string | undefined} localText
 * @returns {Record<string, string>}
 */
export function resolveTestEnv(loaded, localText) {
  if (loaded.CI === "true") return loaded;
  if (localText === undefined) throw new Error("Run scripts/test-db.sh before local tests");
  const local = parseEnv(localText);
  try {
    const api = new URL(local.NEXT_PUBLIC_SUPABASE_URL);
    const db = new URL(local.DATABASE_URL);
    if (![api.hostname, db.hostname].every(host => ["127.0.0.1", "localhost"].includes(host))
        || api.protocol !== "http:" || api.port !== "54351" || db.protocol !== "postgresql:" || db.port !== "54352"
        || local.MGR_TEST_STACK !== "1" || !local.SUPABASE_SECRET_KEY || !local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error();
  } catch {
    throw new Error("Local tests require isolated mgr_test credentials and ports 54351/54352; run scripts/test-db.sh");
  }
  return { ...loaded, ...local };
}

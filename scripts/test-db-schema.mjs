import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { resolveTestEnv } from "./test-env.mjs";

/** @param {string[]} files */
export function expectedMigration(files) {
  const versions = files.flatMap(file => /^(\d+)_.+\.sql$/.exec(file)?.[1] ?? []).sort();
  if (!versions.length) throw new Error("test db: no local migrations");
  return versions[versions.length - 1];
}

/** @param {string} expected @param {string | null} actual */
export function assertMigration(expected, actual) {
  if (actual !== expected) throw new Error(`test db is at ${actual ?? "<missing>"}, this worktree expects ${expected}; run MGR_TEST_DB_RESET=1 bash scripts/test-db.sh or use an isolated 5436x stack`);
}

/** @param {object} expected @param {object | null} actual */
export function assertIdentity(expected, actual) {
  if (!actual || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
    throw new Error(`test db identity mismatch: expected ${JSON.stringify(expected)}; actual ${JSON.stringify(actual)}; run MGR_TEST_DB_RESET=1 bash scripts/test-db.sh (do not override MGR_TEST_DB_LOCK)`);
  }
}

export function localExpectation(root = process.cwd()) {
  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir).filter(file => file.endsWith(".sql")).sort();
  // Reuse the existing migration/config marker, not a second catalog hash.
  const input = Buffer.concat([Buffer.from(files.join("\n") + "\n"), ...files.map(file => readFileSync(join(dir, file))), readFileSync(join(root, "tests/supabase/supabase/config.toml"))]);
  return {
    version: expectedMigration(files),
    fingerprint: `mgr-schema ${execFileSync("git", ["hash-object", "--stdin"], { input, encoding: "utf8" }).trim()}`,
  };
}

export function localEnvironment(root = process.cwd()) {
  const file = join(root, ".env.test.local");
  return resolveTestEnv({}, existsSync(file) ? readFileSync(file, "utf8") : undefined);
}

/** @param {Record<string, string | undefined>} env @param {string} query */
async function sql(env, query) {
  const db = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await db.connect();
  try { return await db.query(query); } finally { await db.end(); }
}

/** Check SQL history first, then compare SQL and REST against the reset's nonce.
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof localExpectation>} expected
 * @param {object} [pinned]
 */
export async function checkSchema(env, expected, pinned) {
  let history;
  try {
    history = (await sql(env, "select max(version) as version, shobj_description((select oid from pg_database where datname=current_database()), 'pg_database') as fingerprint from supabase_migrations.schema_migrations")).rows[0];
  } catch (cause) {
    throw new Error(`test db history unavailable: expected ${JSON.stringify(expected)}; actual SQL history unavailable at the configured disposable database`, { cause });
  }
  assertMigration(expected.version, history.version);
  // CI starts its own fresh stack; it has no local harness-only identity RPC.
  if (env.CI === "true") return;
  assertIdentity(expected, history);
  let identity;
  try {
    const { rows } = await sql(env, "select proname from pg_proc where pronamespace='public'::regnamespace and proname ~ '^mgr_test_identity_[a-f0-9]{32}$'");
    if (rows.length !== 1) throw new Error(`expected one reset identity RPC, actual ${JSON.stringify(rows)}`);
    identity = (await sql(env, `select public.${rows[0].proname}() as identity`)).rows[0].identity;
  } catch (cause) {
    throw new Error(`test db identity unavailable: expected ${JSON.stringify(expected)}; actual SQL ${JSON.stringify(history)}; run scripts/test-db.sh`, { cause });
  }
  assertIdentity(pinned ?? expected, identity);
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${identity.rpc}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10000),
  });
  const actual = await response.json();
  if (!response.ok) throw new Error(`test db REST identity unavailable at ${env.NEXT_PUBLIC_SUPABASE_URL}: expected ${JSON.stringify(identity)}; actual HTTP ${response.status} ${JSON.stringify(actual)}`);
  assertIdentity(identity, actual);
  return identity;
}

async function installIdentity() {
  const env = localEnvironment();
  const expected = localExpectation();
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const reset = randomUUID();
  // A new name cannot be served by the previous reset's schema cache.
  const rpc = `mgr_test_identity_${reset.replaceAll("-", "")}`;
  const identity = { ...expected, reset, rpc, revision, project: "mgr_test" };
  const literal = JSON.stringify(identity).replaceAll("'", "''");
  await sql(env, `
    comment on database postgres is '${expected.fingerprint}';
    create function public.${rpc}() returns jsonb
      language sql stable set search_path = '' as $$ select '${literal}'::jsonb $$;
    revoke all on function public.${rpc}() from public, anon, authenticated;
    grant execute on function public.${rpc}() to service_role;
    notify pgrst, 'reload schema';
  `);
  console.log(`test-db: installed ${JSON.stringify(identity)}`);
}

/** Remove disposable readiness RPC signatures and normalize whitespace-only generated lines.
 * @param {string} source
 */
export async function stripIdentityTypes(source) {
  const { default: ts } = await import("typescript");
  const file = ts.createSourceFile("database.ts", source, ts.ScriptTarget.Latest, true);
  const spans = [];
  function visit(node) {
    if (ts.isPropertySignature(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      const container = node.parent.parent;
      if (/^mgr_test_identity_[a-f0-9]{32}$/.test(name) &&
          ts.isPropertySignature(container) && container.name.getText(file) === "Functions") {
        spans.push([node.getFullStart(), node.end]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const [start, end] of spans.reverse()) source = source.slice(0, start) + source.slice(end);
  return source.replace(/^[\t ]+$/gm, "");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];
  if (command === "fingerprint") console.log(localExpectation().fingerprint);
  else if (command === "install") await installIdentity();
  else if (command === "check") console.log(`test-db: verified ${JSON.stringify(await checkSchema(localEnvironment(), localExpectation()))}`);
  else if (command === "clean-types") {
    const file = process.argv[3];
    writeFileSync(file, await stripIdentityTypes(readFileSync(file, "utf8")));
  }
  else throw new Error("usage: node scripts/test-db-schema.mjs fingerprint|install|check|clean-types FILE");
}

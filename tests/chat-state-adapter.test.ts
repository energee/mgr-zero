// Proves Chat SDK state operations are confined to the private PostgreSQL schema.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPostgresState } from "@chat-adapter/state-pg";

const adminUrl = process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const admin = new pg.Pool({ connectionString: adminUrl });
const role = `mgr_chat_test_${process.pid}`;
const password = crypto.randomUUID();
let restricted: pg.Pool;

beforeAll(async () => {
  await admin.query(`create role ${role} login password '${password}'`);
  await admin.query(`grant mgr_chat_sdk to ${role}`);
  const restrictedUrl = new URL(adminUrl);
  restrictedUrl.username = role;
  restrictedUrl.password = password;
  restricted = new pg.Pool({
    connectionString: restrictedUrl.toString(),
    options: "-c search_path=chat_sdk",
  });
});

afterAll(async () => {
  await restricted?.end();
  await admin.query(`revoke mgr_chat_sdk from ${role}`);
  await admin.query(`drop role if exists ${role}`);
  await admin.end();
});

describe("Chat SDK Postgres state isolation", () => {
  it("confines adapter CREATE to chat_sdk and denies public data access", async () => {
    const groupRole = await admin.query(
      `select
         child.rolcanlogin,
         child.rolsuper,
         child.rolcreatedb,
         child.rolcreaterole,
         child.rolbypassrls,
         child.rolreplication,
         coalesce(
           json_agg(parent.rolname order by parent.rolname)
             filter (where parent.rolname is not null),
           '[]'::json
         ) as member_of
       from pg_roles child
       left join pg_auth_members membership on membership.member = child.oid
       left join pg_roles parent on parent.oid = membership.roleid
       where child.rolname = 'mgr_chat_sdk'
       group by
         child.rolcanlogin,
         child.rolsuper,
         child.rolcreatedb,
         child.rolcreaterole,
         child.rolbypassrls,
         child.rolreplication`,
    );
    expect(groupRole.rows[0]).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolreplication: false,
      member_of: [],
    });

    const privilege = await admin.query(
      `select
         has_schema_privilege($1, 'chat_sdk', 'CREATE') as can_create_chat,
         has_schema_privilege($1, 'public', 'CREATE') as can_create_public`,
      [role],
    );
    expect(privilege.rows[0]).toEqual({
      can_create_chat: true,
      can_create_public: false,
    });

    const state = createPostgresState({ client: restricted, keyPrefix: `mgr-test-${process.pid}` });
    await state.connect();
    await state.set("probe", { ok: true }, 60_000);
    await expect(state.get("probe")).resolves.toEqual({ ok: true });
    const lock = await state.acquireLock("slack:T1:C1", 5_000);
    expect(lock).not.toBeNull();
    if (lock) await state.releaseLock(lock);

    await expect(restricted.query("select count(*) from public.breweries")).rejects.toThrow(/permission denied/i);
    await state.disconnect();
  });
});

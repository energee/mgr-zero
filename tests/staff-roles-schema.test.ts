import { describe, expect, it } from "vitest";
import { sql } from "./helpers";

interface FunctionBody { signature: string; arguments: string; body: string }

// Ignore only references proven to belong to the deliberately scalar invite and
// chat-message records. Do not exempt entire functions: grant_invite_membership
// must keep p_row.role while still being caught if its INSERT names staff role.
function readsScalarMembershipRole(fn: FunctionBody) {
  const source = `${fn.arguments};${fn.body}`
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/"([a-z_][a-z_0-9]*)"/gi, "$1");
  if (!/\bbrewery_users\b/i.test(source)) return false;
  const scalarRecords = new Set<string>();
  // Parameters and PL/pgSQL variables with a concrete row type.
  for (const match of source.matchAll(/\b([a-z_][a-z_0-9]*)\s+(?:(?:private|public)\s*\.\s*)?(?:invite_requests|chat_messages)(?:\s*%rowtype)?\b/gi)) scalarRecords.add(match[1]);
  // SQL range variables of the two intentionally scalar relations.
  for (const match of source.matchAll(/\b(?:from|join)\s+(?:(?:private|public)\s*\.\s*)?(?:invite_requests|chat_messages)\s+(?:as\s+)?([a-z_][a-z_0-9]*)/gi)) scalarRecords.add(match[1]);
  let membershipSource = source.replace(/\bauth\s*\.\s*role\s*\(\s*\)/gi, " ")
    // Invite INSERT column names are deliberately scalar; do not exempt any
    // other part of a function that also queries brewery staff membership.
    .replace(/\binsert\s+into\s+(?:private\s*\.\s*)?invite_requests\s*\([^)]*\)/gi, " ");
  for (const record of scalarRecords) membershipSource = membershipSource.replace(new RegExp(`\\b${record}\\s*\\.\\s*role\\b`, "gi"), " ");
  return /\brole\b/i.test(membershipSource);
}

describe("staff role array clean cutover (#797)", () => {
  it("stores a required staff_role[] and has no live scalar membership column", () => {
    expect(sql(`select attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull
      from pg_attribute where attrelid='public.brewery_users'::regclass
      and attnum>0 and not attisdropped and attname in ('role','roles') order by attname`))
      .toEqual(["roles:staff_role[]:true"]);
    expect(sql(`select count(*) from pg_constraint where conrelid='public.brewery_users'::regclass
      and contype='c' and pg_get_constraintdef(oid) ~ 'cardinality\\(roles\\).* > 0'`)).toEqual(["1"]);
    // An invitation is still one role; changing this would silently expand D3.
    expect(sql(`select format_type(atttypid,atttypmod) from pg_attribute
      where attrelid='private.invite_requests'::regclass and attname='role' and not attisdropped`))
      .toEqual(["staff_role"]);
  });

  it("drops staff_role(uuid), retaining only the array and plain-overlap helper signatures", () => {
    expect(sql("select coalesce(to_regprocedure('public.staff_role(uuid)')::text,'absent')")).toEqual(["absent"]);
    expect(sql(`select p.proname||':'||pg_get_function_result(p.oid) from pg_proc p
      where p.oid in ('public.staff_roles(uuid)'::regprocedure,
        'public.has_staff_role(uuid,public.staff_role[])'::regprocedure) order by p.proname`))
      .toEqual(["has_staff_role:boolean", "staff_roles:staff_role[]"]);
  });

  it("has no live policy calling the removed scalar helper", () => {
    expect(sql(`select schemaname||'.'||tablename||':'||policyname from pg_policies
      where coalesce(qual,'')||coalesce(with_check,'') ~ '(^|[^a-z_])staff_role[[:space:]]*\\('
      order by 1`)).toEqual([]);
  });

  // is_staff_of(col) runs once per row (SECURITY DEFINER blocks inlining); the
  // `col in (select my_staff_brewery_ids(...))` form runs once per query.
  it("has no live policy checking staff access row by row with is_staff_of", () => {
    expect(sql(`select tablename||':'||policyname from pg_policies where schemaname='public'
      and coalesce(qual,'')||coalesce(with_check,'') ~ 'is_staff_of[[:space:]]*\\('
      order by 1`)).toEqual([]);
  });

  it("has no public/private scalar membership readers, even in PL/pgSQL bodies", () => {
    const functions = sql(`select json_build_object('signature',p.oid::regprocedure::text,
        'arguments',pg_get_function_arguments(p.oid),'body',p.prosrc)::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prokind='f'
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
      order by p.oid::regprocedure::text`).map(row => JSON.parse(row) as FunctionBody);
    expect(functions.length, "nonempty live function catalog").toBeGreaterThan(0);
    expect(functions.filter(readsScalarMembershipRole).map(fn => fn.signature)).toEqual([]);
    expect(functions.filter(fn => /\b(?:public\s*\.\s*)?staff_role\s*\(/i.test(fn.body)).map(fn => fn.signature)).toEqual([]);
    expect(functions.filter(fn => /\b(?:actor|v_actor)\s*->>\s*'role'/i.test(fn.body)).map(fn => fn.signature)).toEqual([]);
  });
});

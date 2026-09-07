// lib/mgr/api-reference.ts — renders one area's operations as the markdown that
// lives inside content/docs/api.mdx. Fumadocs extracts its "On this
// page" tree from MDX headings at compile time, so a component cannot put an
// operation in the table of contents: each operation has to be a real heading
// in the file. Levels are chosen for the TOC's three indents (fumadocs-ui
// getItemOffset: depth <=2, 3, and 4+): content/docs/api.mdx writes the rules
// as `##`, `## Operations` holds each area as `###`, and each operation is
// `####`, so the rail nests area over operation and tracks the scroll, while
// the left sidebar carries one HTTP API entry. scripts/write-api-docs.ts writes these blocks and
// tests/api-docs.test.ts re-renders them to prove the files still match the
// registry and the screens.
import { apiOperations, areaOf, operationsInArea, API_AREAS, type ApiAreaSlug, type ApiOperation } from "@/lib/mgr/api-operations";
import { fieldsOf, sampleInput } from "@/lib/mgr/api-schema";
import { API_ERRORS } from "@/lib/mgr/api-errors";
import { getCommandDefinition } from "@/lib/commands/registry";

/** The MDX comments one area's generated operations sit between; prose outside is yours. */
export const opsStart = (key: string) => `{/* ops:${key} */}`;
export const opsEnd = (key: string) => `{/* end ops:${key} */}`;

/** The request body a caller sends: the envelope, with this operation's input. */
function exampleBody(o: ApiOperation, input: Record<string, unknown>) {
  const body: Record<string, unknown> = { breweryId: "00000000-0000-0000-0000-000000000000", name: o.name };
  // Only a write needs a client-generated request id; a query may omit it.
  if (o.kind === "command") body.requestId = "11111111-1111-1111-1111-111111111111";
  body.input = input;
  return JSON.stringify(body, null, 2);
}

function available(o: ApiOperation) {
  const schema = getCommandDefinition(o.name)?.input;
  const fields = schema ? fieldsOf(schema) : [];
  const parts = [`#### ${o.name} [#${o.name}]`, `\`${o.kind}\` · ${o.roles}`, o.description ?? ""];

  parts.push(
    fields.length > 0
      ? ["| Field | Type | Required |", "| --- | --- | --- |",
         ...fields.map((f) => `| \`${f.name}\` | ${f.type} | ${f.required ? "yes" : "no"} |`)].join("\n")
      : "Takes no input.",
  );

  const body = exampleBody(o, schema ? sampleInput(schema) : {});
  parts.push(
    ["```bash", `curl -X POST "$MGR_URL/api/command" \\`, `  -H 'content-type: application/json' \\`,
     `  -H "authorization: Bearer $MGR_TOKEN" \\`, `  -d '${body.replace(/\n\s*/g, " ")}'`, "```"].join("\n"),
  );
  return parts.filter(Boolean).join("\n\n");
}

/** One row of the closing list: a designed operation and the screens waiting on it. */
const designed = (o: ApiOperation) => `| \`${o.name}\` | ${o.kind} | ${o.screens.join(", ")} |`;

/**
 * The generated block for one area section, headings and all. Anchors are
 * area-scoped (`#orders-available`, not `#available`): every area lives on the
 * one page, so a bare status anchor would repeat 13 times — duplicate ids that
 * send a link to the wrong section, and duplicate React keys that stop the
 * table of contents rendering and tracking correctly.
 */
export function renderArea(slug: ApiAreaSlug): string {
  const operations = operationsInArea(slug);
  const live = operations.filter((o) => o.status === "available");
  const planned = operations.filter((o) => o.status === "designed");
  const sections: string[] = [];

  // What a caller can actually do comes first, one entry per operation.
  sections.push(...live.map(available));

  // What they cannot, last and compact: a designed operation has no schema to
  // document, so a row naming the screens waiting on it says everything there
  // is to say. The count states plainly how much of the area is real.
  if (planned.length > 0) {
    sections.push(
      "---",
      // A label, not a heading: the rail lists areas, and this is not one.
      `**Designed, not yet available** {/* ${slug}-designed */}`,
      live.length > 0
        ? `${live.length} of the ${operations.length} operations in this area are available today; the ${planned.length} below are not.`
        : `None of the ${operations.length} operations in this area are available yet.`,
      "The screens need them and the backend has not built them, so calling one returns `404 unknown_command`. They are listed so you can see what is coming, and which screen is waiting, without a date attached.",
      ["| Operation | Kind | Needed by |", "| --- | --- | --- |", ...planned.map(designed)].join("\n"),
    );
  }
  return [opsStart(slug), ...sections, opsEnd(slug)].join("\n\n") + "\n";
}

/** Every failure the endpoint can return, by status. */
export function renderErrors(): string {
  const rows = [...API_ERRORS].sort((a, b) => a.status - b.status || a.code.localeCompare(b.code));
  return [
    opsStart("errors"),
    "| Status | `code` | What happened | What to do |",
    "| --- | --- | --- | --- |",
    ...rows.map((e) => `| ${e.status} | \`${e.code}\` | ${e.meaning} | ${e.remedy} |`),
    opsEnd("errors"),
  ].join("\n") + "\n";
}

const ROLES = ["admin", "sales", "warehouse", "brewer", "customer"] as const;

/** Which role may call which available operation, one row per operation. */
export function renderRoleMatrix(): string {
  const rows = apiOperations()
    .filter((o) => o.status === "available")
    .map((o) => {
      // `roles` is the registry's own value flattened to a string, and "any" is
      // one of its three shapes (StaffRole[] | "customer" | "any"). Matching it
      // by name alone would tick nothing and document an operation open to
      // everyone as callable by nobody.
      const roles = o.roles ?? "";
      const cells = ROLES.map((r) => (roles === "any" || roles.split(", ").includes(r) ? "✓" : ""));
      const area = API_AREAS.find((a) => a.slug === areaOf(o.name));
      return `| \`${o.name}\` | ${area?.title ?? ""} | ${cells.join(" | ")} |`;
    });
  return [
    opsStart("roles"),
    `| Operation | Area | ${ROLES.join(" | ")} |`,
    `| --- | --- | ${ROLES.map(() => "---").join(" | ")} |`,
    ...rows,
    opsEnd("roles"),
  ].join("\n") + "\n";
}

export const BACKLOG_PATH = ".agents/superpowers/plans/2026-09-06-api-operations-backlog.md";

/**
 * The designed operations as one plan of record, by area. Generated from the
 * same derivation as the reference — the screens name what they need, the
 * registry says what exists, and the difference is the backend backlog. Sized
 * per area so the backend push can be scoped area by area rather than as one
 * undifferentiated list.
 */
export function renderBacklog(): string {
  const operations = apiOperations();
  const live = operations.filter((o) => o.status === "available").length;
  const planned = operations.filter((o) => o.status === "designed");

  const areas = API_AREAS.map((area) => {
    // One derivation per area: operationsInArea re-walks every screen and the
    // whole registry, so asking it twice doubled the work for no new answer.
    const inArea = operationsInArea(area.slug);
    const rows = inArea.filter((o) => o.status === "designed");
    const built = inArea.length - rows.length;
    if (rows.length === 0) return "";
    return [
      `## ${area.title}: ${rows.length} to build, ${built} built`,
      "",
      "| Operation | Kind | Needed by |",
      "| --- | --- | --- |",
      ...rows.map((o) => `| \`${o.name}\` | ${o.kind} | ${o.screens.join(", ")} |`),
    ].join("\n");
  }).filter(Boolean);

  return [
    "<!-- Generated by `bun run docs:api` from lib/mgr/api-operations.ts. Do not edit by hand:",
    "     tests/api-docs.test.ts re-renders this file and fails on drift. To change what",
    "     appears here, register a command or change what a screen declares it reads and writes. -->",
    "",
    "# API operations backlog",
    "",
    `${planned.length} operations the screens declare they need that the command registry does not yet answer, against ${live} that it does.`,
    "",
    "This is the backend push, scoped. Each row names the operation a screen asked for and the screens waiting on it, so an area can be built and shipped whole rather than a command at a time. `/docs/api` publishes the same list per area, marked designed, so an integrator sees the roadmap without being told a date.",
    "",
    "Nothing here is a schema decision. An operation appears because a screen named it in its `reads` or `writes`; what it takes and returns is settled when it is built.",
    "",
    ...areas,
    "",
  ].join("\n");
}

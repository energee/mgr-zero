// lib/mgr/screen-routes.ts — which live page draws each ungated MGR screen
// record. tests/app-screen-parity.test.ts fails when the inventory promises a
// screen the app does not have: every name ungatedMgrScreens() returns must map
// here to a page file that exists. Rows are added as pages land; a screen with
// no row is a missing page, not a typo. Files are repo-relative paths under
// app/, so the map doubles as the reader's index from screen to source.
import { SCREENS, type Screen } from "@/components/mgr/screens";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";

export const SCREEN_ROUTES: { name: string; file: string }[] = [];

/** A gate keeps the screen out until the named program lifts it. */
const GATE = /(SCHEMA\/RLS-GATE|SCHEMA-GATE|IMPLEMENTATION-GATE)/;
/** Tokens that are not registry commands: auth platform calls and client state. */
const NOT_A_COMMAND = /\[(platform|client state)/;

/** Command names a `writes` or `reads` string names, minus platform and
 * client-state tokens. Tags close a list ("a · b [design]"), so a part inherits
 * the tag of the next tagged part, as tests/screen-command-gates.test.ts reads it. */
function commandTokens(text: unknown): string[] {
  if (typeof text !== "string") return [];
  const names: string[] = [];
  let skip = false;
  for (const part of text.split("·").map((p) => p.trim()).reverse()) {
    if (/\[/.test(part)) skip = NOT_A_COMMAND.test(part);
    if (skip) continue;
    const name = part.match(/^([a-z_]+)/)?.[1];
    if (name && name.includes("_")) names.push(name);
  }
  return names;
}

/** Whether the live app can draw this record today: no gate tag, and every
 * command it reads or writes is registered. A screen still tagged `[design]`
 * on a command that has since shipped counts as live — the tag is stale prose,
 * the registry is the fact. */
export function isUngated(s: Screen): boolean {
  if (s.venue) return false;
  const text = [s.writes, s.reads].filter((t): t is string => typeof t === "string");
  if (text.some((t) => GATE.test(t))) return false;
  return text.flatMap(commandTokens).every((name) => Boolean(getCommandDefinition(name)));
}

/** Programs 11 and 15 own these; their records name no command a gate could sit on. */
const DEFERRED = new Set(["Accept invite", "Expired invite", "Expired reset", "Composer answer", "Offline outbox"]);

/** The MGR screens the parity test holds the app to. */
export const ungatedMgrScreens = (): Screen[] => SCREENS.filter((s) => isUngated(s) && !DEFERRED.has(s.name));

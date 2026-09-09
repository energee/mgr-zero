// lib/mgr/api-operations.ts — the one derivation behind /docs/api. Every
// operation the reference lists comes from a source that already exists:
// lib/commands (what POST /api/command answers today, with its roles and
// description) and the `reads`/`writes` each screen declares in
// components/mgr/screens.tsx (what the product still needs). Nothing is
// hand-listed, so the reference cannot drift from the registry or the screens.
import { SCREENS } from "@/components/mgr/screens";
import { getCommandDefinition, listTools } from "@/lib/commands/registry";
import "@/lib/commands/all";

export type ApiStatus = "available" | "designed";

export type ApiOperation = {
  name: string;
  kind: "query" | "command";
  status: ApiStatus;
  /** Roles allowed to call it; registered operations only. */
  roles?: string;
  scope?: "tenant" | "pretenant";
  /** The registry's own one-line description; registered operations only. */
  description?: string;
  /** Screens that read or write it — the reason a designed operation exists. */
  screens: string[];
};

/** A page of the reference: its slug, title, and the names it claims. Ordered
 * by match precedence, first rule wins — `create_purchase_order` is purchasing
 * rather than orders because purchasing is listed first. The page's own heading
 * order is what a reader scrolls through; the two orders are deliberately
 * independent. */
export const API_AREAS = [
  { slug: "portal", title: "Customer portal", match: /^(portal_|get_portal_|list_portal_)/ },
  { slug: "compliance", title: "Compliance", match: /(compliance|brand_approval|state_registration|state_license|list_lots|trace_lot|loss)/ },
  { slug: "purchasing", title: "Purchasing & materials", match: /(purchase_order|vendor|material)/ },
  { slug: "production", title: "Production", match: /(batch|brew_day|cellar|vessel|fermentation|recipe|water_profile)/ },
  { slug: "catalog", title: "Catalog & pricing", match: /^(?!get_inventory_sku$).*(product|sku|brand|price|sale_channel|sales_channel)/ },
  { slug: "packaging", title: "Packaging", match: /(packaging_run|format|repack|occupanc)/ },
  { slug: "taproom", title: "Taproom & kegs", match: /(keg|taproom|_taps|tap_history|replenishment)/ },
  { slug: "delivery", title: "Delivery & routes", match: /(route|delivery|shipment|depart)/ },
  { slug: "orders", title: "Orders & invoicing", match: /(order|invoice|pick|allocation|credit_memo|restock)/ },
  { slug: "inventory", title: "Inventory & locations", match: /(movement|on_hand|atp|bin|location|count|inventory|transfer)/ },
  { slug: "customers", title: "Customers", match: /(customer|ship_to|portal_fulfillment)/ },
  { slug: "team", title: "Team & brewery settings", match: /(staff|team|invite|brewery|provision|first_run|operating_defaults|import_csv|gravity_unit|qbo)/ },
  { slug: "today", title: "Today & notifications", match: /(today|work|notification|shortfall|search_entities|beer_overview|snooze|quiet_hours|chat|preview_command)/ },
] as const;

export type ApiAreaSlug = (typeof API_AREAS)[number]["slug"];

// QuickBooks, Square/POS and the Slack installation lifecycle are integration
// plumbing, not day-to-day brewery operations: a designed one is left out of
// the reference. Registered operations are never excluded — whatever the
// endpoint answers today is documented, or the docs would lie by omission.
const INTEGRATION = /(qbo|square|pos_|chat_installation|chat_integration|chat_reauthorization|chat_preview|chat_operations|chat_user_links|_pos_|pos_sales|^push_invoice$)/;

// screens.tsx writes prose alongside operation names ("· the taproom role
// [SCHEMA-GATE: …]"); a real name always carries an underscore. A screen also
// names what the client and the platform do — `local_outbox [client state]`,
// `supabase_auth_sign_out [platform]` — and neither is an API operation.
// `[view]` is the third: a query composed for one screen (`get_cellar_map
// [view]`). It will exist, but its shape follows the screen, so publishing it
// as integration surface would promise a contract nobody asked for.
const isOperationName = (name: string) => name.includes("_") && !name.startsWith("supabase_");
const NOT_AN_OPERATION = /\[(client state|platform|view)/;

/** Every operation named by a screen, with the screens that name it. */
function screenOperations() {
  const found = new Map<string, { kind: "query" | "command"; screens: string[] }>();
  for (const screen of SCREENS) {
    for (const [field, kind] of [["reads", "query"], ["writes", "command"]] as const) {
      const declared = screen[field];
      if (typeof declared !== "string") continue;
      for (const part of declared.split("·")) {
        if (NOT_AN_OPERATION.test(part)) continue;
        const name = part.trim().match(/^([a-z_]+)/)?.[1];
        if (!name || !isOperationName(name)) continue;
        const entry = found.get(name) ?? { kind, screens: [] };
        // A name that any screen writes is a command, however else it is read.
        if (kind === "command") entry.kind = "command";
        if (!entry.screens.includes(screen.name)) entry.screens.push(screen.name);
        found.set(name, entry);
      }
    }
  }
  return found;
}

/** The area a name belongs to, or undefined when no rule claims it. */
export const areaOf = (name: string): ApiAreaSlug | undefined =>
  API_AREAS.find((a) => a.match.test(name))?.slug;

/** Every operation the reference documents, registered and designed alike. */
export function apiOperations(): ApiOperation[] {
  const fromScreens = screenOperations();
  const operations: ApiOperation[] = [];

  for (const tool of listTools()) {
    const definition = getCommandDefinition(tool.name);
    const roles = definition?.roles;
    operations.push({
      name: tool.name,
      kind: tool.kind,
      status: "available",
      roles: definition?.scope === "pretenant" ? "authenticated pre-tenant" : Array.isArray(roles) ? roles.join(", ") : roles,
      scope: definition?.scope,
      description: tool.description,
      screens: fromScreens.get(tool.name)?.screens ?? [],
    });
  }

  const registered = new Set(operations.map((o) => o.name));
  for (const [name, { kind, screens }] of fromScreens) {
    if (registered.has(name) || INTEGRATION.test(name)) continue;
    operations.push({ name, kind, status: "designed", screens });
  }

  return operations.sort((a, b) => a.name.localeCompare(b.name));
}

/** The operations on one page of the reference, available ones first. */
export const operationsInArea = (slug: ApiAreaSlug) =>
  apiOperations()
    .filter((o) => areaOf(o.name) === slug)
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "available" ? -1 : 1));

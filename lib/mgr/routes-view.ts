// lib/mgr/routes-view.ts — view-model for the Routes / Deliveries list and
// its Open / Returned Status pick (ScopePick options; live links only with `linked`).
import type { ScopeOption } from "@/components/mgr/scope-pick";
import type { EmptyState } from "./empty-state";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type RoutesRowView = {
  key: string;
  title: string;
  detail: string;
  /** The next action; an assigned route not yet departed has none and its row is a plain link (#1026). */
  verb?: string;
  tone?: "info" | "attention";
  warning?: boolean;
  href?: string;
};

/** list_routes' status input: open routes (the default) or returned ones. */
export const ROUTE_STATUSES = ["open", "returned"] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export type RoutesViewModel = {
  title: string;
  subtitle: string;
  status: RouteStatus;
  statusOptions: ScopeOption[];
  rows: RoutesRowView[];
  empty?: EmptyState;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type RoutesSnapshot = {
  title: string;
  subtitle: string;
  status?: RouteStatus;
  /** list_routes' anyReturned: an empty Open list then names Returned instead of "No routes yet". */
  anyReturned?: boolean;
  /** The live page: Status options carry hrefs. The inventory leaves them inert. */
  linked?: boolean;
  rows?: RoutesRowView[];
  empty?: EmptyState;
};

/** A route's next action: Resume once it has departed, Assign while it has no
 *  driver. An assigned route that has not departed, or one already returned,
 *  has none, so its row is a plain link rather than an "Open" verb (#1026). */
export function routeNext(route: { departed_at: string | null; returned_at: string | null; driver_user_id: string | null }): { verb: string; tone: "info" | "attention" } | undefined {
  if (route.returned_at) return undefined;
  if (route.departed_at) return { verb: "Resume", tone: "info" };
  if (!route.driver_user_id) return { verb: "Assign", tone: "attention" };
  return undefined;
}

function emptyRoutes(status: RouteStatus, anyReturned: boolean | undefined): EmptyState {
  if (status === "returned") return { title: "No returned routes", description: "A route moves here once it is returned." };
  if (anyReturned) return { title: "No open routes", description: "Returned routes are under Returned." };
  return { title: "No routes yet", description: "A route groups the day's deliveries into one run." };
}

export function toRoutesViewProps(s: RoutesSnapshot): RoutesViewModel {
  const rows = s.rows ?? [];
  const status = s.status ?? "open";
  const link = (href: string) => (s.linked ? href : undefined);
  return {
    title: s.title,
    subtitle: s.subtitle,
    status,
    statusOptions: [
      { value: "open", label: "Open", href: link("/routes") },
      { value: "returned", label: "Returned", href: link("/routes?status=returned") },
    ],
    rows,
    empty: s.empty ?? (rows.length === 0 ? emptyRoutes(status, s.anyReturned) : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 6,
    workTabs: WORK_TABS,
  };
}

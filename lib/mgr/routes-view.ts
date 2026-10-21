// lib/mgr/routes-view.ts — view-model for the Routes / Deliveries list.
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

export type RoutesViewModel = {
  title: string;
  subtitle: string;
  rows: RoutesRowView[];
  empty?: EmptyState;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type RoutesSnapshot = {
  title: string;
  subtitle: string;
  rows?: RoutesRowView[];
  empty?: EmptyState;
};

/** A route's next action: Resume once it has departed, Assign while it has no
 *  driver. An assigned route that has not departed has none, so its row is a
 *  plain link rather than an "Open" verb (#1026). */
export function routeNext(route: { departed_at: string | null; driver_user_id: string | null }): { verb: string; tone: "info" | "attention" } | undefined {
  if (route.departed_at) return { verb: "Resume", tone: "info" };
  if (!route.driver_user_id) return { verb: "Assign", tone: "attention" };
  return undefined;
}

export function toRoutesViewProps(s: RoutesSnapshot): RoutesViewModel {
  const rows = s.rows ?? [];
  return {
    title: s.title,
    subtitle: s.subtitle,
    rows,
    empty: s.empty ?? (rows.length === 0 ? { title: "No routes yet", description: "A route groups the day's deliveries into one run." } : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 6,
    workTabs: WORK_TABS,
  };
}

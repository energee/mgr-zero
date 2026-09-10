// lib/mgr/routes-view.ts — view-model for the Routes / Deliveries list.
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type RoutesRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  warning?: boolean;
  href?: string;
};

export type RoutesViewModel = {
  title: string;
  subtitle: string;
  rows: RoutesRowView[];
  empty?: string;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type RoutesSnapshot = {
  title: string;
  subtitle: string;
  rows?: RoutesRowView[];
  empty?: string;
};

export function toRoutesViewProps(s: RoutesSnapshot): RoutesViewModel {
  const rows = s.rows ?? [];
  return {
    title: s.title,
    subtitle: s.subtitle,
    rows,
    empty: s.empty ?? (rows.length === 0 ? "No routes yet" : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 6,
    workTabs: WORK_TABS,
  };
}

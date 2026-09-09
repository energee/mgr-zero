// lib/mgr/batches-view.ts — view-model for the Batches Work list.
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type BatchesRowView = {
  key: string;
  title: string;
  detail: string;
  verb: string;
  tone: "info" | "attention" | "success" | "primary";
  warning?: boolean;
  href?: string;
};

export type BatchesViewModel = {
  title: string;
  subtitle: string;
  planned: BatchesRowView[];
  active: BatchesRowView[];
  empty?: string;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type BatchesSnapshot = {
  title: string;
  subtitle: string;
  planned?: BatchesRowView[];
  active?: BatchesRowView[];
  empty?: string;
};

export function toBatchesViewProps(s: BatchesSnapshot): BatchesViewModel {
  const planned = s.planned ?? [];
  const active = s.active ?? [];
  return {
    title: s.title,
    subtitle: s.subtitle,
    planned,
    active,
    empty: s.empty ?? (planned.length === 0 && active.length === 0 ? "No batches yet" : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 3,
    workTabs: WORK_TABS,
  };
}

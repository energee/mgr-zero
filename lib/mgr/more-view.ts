// lib/mgr/more-view.ts — view-model for the More landing: the cards split
// under their area headings (navGroups), so an area with no card is not drawn.
import { navGroups, type NavGroup } from "@/lib/mgr/nav";

export type MoreNavView = { key: string; title: string; detail?: string; href?: string; mark?: "qbo" | "none"; group?: NavGroup };

export type MoreViewModel = { groups: { group?: NavGroup; items: MoreNavView[] }[] };

export function toMoreViewProps(navs: MoreNavView[]): MoreViewModel {
  return { groups: navGroups(navs) };
}

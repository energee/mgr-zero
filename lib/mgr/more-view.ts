// lib/mgr/more-view.ts — view-model for the More landing.
export type MoreNavView = { key: string; title: string; detail?: string; href?: string; mark?: "qbo" | "none" };

export type MoreViewModel = { navs: MoreNavView[] };

export function toMoreViewProps(navs: MoreNavView[]): MoreViewModel {
  return { navs };
}

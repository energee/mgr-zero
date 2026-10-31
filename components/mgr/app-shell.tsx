// components/mgr/app-shell.tsx — the one navigation shell for staff and
// portal (plan §3, §6), built on shadcn's Sidebar. At md and up the sidebar
// is the left rail (every tab a menu item with its icon, children indented
// under it as sub-items, More's under their area headings, ⌘B
// collapses it to a 48px icon rail — each tab keeps its glyph and names
// itself in a tooltip, and the sub-items fold away (#305)); below md the sidebar is hidden and a bottom tab bar with
// 48px targets and safe-area padding takes over. Breakpoints are viewport
// media queries, which is why the screen inventory renders each frame in an
// iframe. (pointer: coarse) sizing comes from app/globals.css.
"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MgrIcon } from "@/components/mgr-icon";
import { Icon } from "@/components/mgr/icon";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { activeChild, activeTab, isUnder, navGroups, PORTAL_NAV, type NavItem } from "@/lib/mgr/nav";
import { cn } from "@/lib/utils";

export type AppShellProps = {
  brand: React.ReactNode;
  items: readonly NavItem[];
  /** Header controls (Search, Me, Sign out). Owned by the layout, not the shell. */
  headerRight?: React.ReactNode;
  /** Header workspace switch and its conversation overlay. */
  composer?: React.ReactNode;
  /** Force the active tab (the inventory renders screens off their real route). */
  active?: string;
  /** Initial rail state; layouts read it with lib/mgr/sidebar-state.ts. */
  sidebarOpen?: boolean;
  children: React.ReactNode;
};

export function AppShell({ brand, items, headerRight, composer, active, sidebarOpen, children }: AppShellProps) {
  const pathname = usePathname();
  const current = active ?? activeTab(items, pathname)?.label;
  const brandMark = (
    <span className="flex items-center gap-2 truncate">
      <MgrIcon size={16} className="shrink-0" />
      {brand}
    </span>
  );
  return (
    <TooltipProvider>
    <SidebarProvider defaultOpen={sidebarOpen} className="h-dvh min-h-0 print:h-auto">
      {/* The first Tab stop, so keyboard users jump past every sidebar link. It acts in place, so the screen explorer leaves it alone. */}
      <a href="#main" data-preview-action className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md">Skip to main content</a>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-12 justify-center px-4 text-sm font-medium">{brandMark}</SidebarHeader>
        <SidebarContent>
          {/* Every tab is drawn the same way — icon, label, one menu button —
              whether or not it has children; a parent used to be a quiet group
              label, so Today and Beer read as different kinds of thing. Children
              are sub-items indented under their tab. */}
          <SidebarGroup>
            <nav aria-label="Primary">
              <SidebarMenu>
                {items.map((tab) => {
                  const leaf = !tab.children?.length;
                  const tabActive = tab.label === current && (leaf || isUnder(pathname, tab.href));
                  const child = tab.label === current ? activeChild(tab, pathname) : undefined;
                  return (
                    <SidebarMenuItem key={tab.label}>
                      <SidebarMenuButton asChild tooltip={tab.label} isActive={tabActive}>
                        <Link href={tab.href} aria-current={tabActive ? "page" : undefined}>{tab.icon && <Icon icon={tab.icon} />}<span>{tab.label}</span></Link>
                      </SidebarMenuButton>
                      {!leaf && (
                        <SidebarMenuSub>
                          {navGroups(tab.children!).map(({ group, items: kids }) => (
                            <Fragment key={group ?? ""}>
                              {group && <li className="px-2 pt-2 text-xs font-medium text-sidebar-foreground/70">{group}</li>}
                              {kids.map((c) => (
                                <SidebarMenuSubItem key={c.href}>
                                  <SidebarMenuSubButton asChild isActive={c === child}>
                                    <Link href={c.href} aria-current={c === child ? "page" : undefined}>{c.label}</Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </Fragment>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden print:h-auto print:overflow-visible">
        <header role="banner" className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b px-2 py-2 md:h-12 md:py-0">
          {/* One Ask MGR button fits beside the brand, so a phone header stays one row (#1512). */}
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            {composer && <span className="max-w-48 truncate text-xs text-muted-foreground md:hidden">{brandMark}</span>}
            <SidebarTrigger className="hidden md:inline-flex" />
            {composer ?? <span className="md:hidden">{brandMark}</span>}
          </div>
          {headerRight && <span className="flex shrink-0 items-center gap-1">{headerRight}</span>}
        </header>
        {/* SidebarInset is already the <main> landmark; only page content scrolls. */}
        <div id="main" tabIndex={-1} data-mgr-page-scroll="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 outline-none md:px-8 md:py-6 print:overflow-visible">{children}</div>
        <TabBar items={items} active={current} className="md:hidden" />
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}

/** Phone navigation stays below chat (45) and modal forms (50). */
export function TabBar({ items, active, className }: { items: readonly NavItem[]; active?: string; className?: string }) {
  return (
    <nav
      aria-label="Tabs"
      className={cn("relative z-40 grid shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)] text-xs", className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.label === active ? "page" : undefined}
          className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5", t.label === active ? "font-medium text-foreground" : "text-muted-foreground")}
        >
          {t.icon && <Icon icon={t.icon} size={20} />}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** The wholesale portal is the same shell with buyer-facing items (plan §3). */
export function PortalShell(props: Omit<AppShellProps, "items">) {
  return <AppShell items={PORTAL_NAV} {...props} />;
}

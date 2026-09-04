// components/mgr/app-shell.tsx — the one navigation shell for staff and
// portal (plan §3, §6), built on shadcn's Sidebar. At md and up the sidebar
// is the left rail (tabs as group labels, children as menu items, ⌘B
// collapses it); below md the sidebar is hidden and a bottom tab bar with
// 48px targets and safe-area padding takes over. Breakpoints are viewport
// media queries, which is why the screen inventory renders each frame in an
// iframe. (pointer: coarse) sizing comes from app/globals.css.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MgrIcon } from "@/components/mgr-icon";
import { Icon } from "@/components/mgr/icon";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { activeTab, isUnder, PORTAL_NAV, type NavItem } from "@/lib/mgr/nav";
import { cn } from "@/lib/utils";

export type AppShellProps = {
  brand: React.ReactNode;
  items: readonly NavItem[];
  /** Header controls (Search, Me, Sign out). Owned by the layout, not the shell. */
  headerRight?: React.ReactNode;
  /** Composer strip above the tab bar; omitted until the composer ships. */
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
    <SidebarProvider defaultOpen={sidebarOpen}>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="h-12 justify-center px-4 text-sm font-medium">{brandMark}</SidebarHeader>
        <SidebarContent>
          {items.map((tab) => {
            const leaf = !tab.children?.length;
            return (
            <SidebarGroup key={tab.label}>
              {!leaf && (
                <SidebarGroupLabel asChild>
                  <Link href={tab.href} className="gap-2">{tab.icon && <Icon icon={tab.icon} />}{tab.label}</Link>
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {(leaf ? [tab] : tab.children!).map((c) => (
                    <SidebarMenuItem key={c.href}>
                      <SidebarMenuButton asChild isActive={tab.label === current && (leaf || isUnder(pathname, c.href))}>
                        <Link href={c.href}>{leaf && tab.icon && <Icon icon={tab.icon} />}{c.label}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            );
          })}
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-h-svh">
        <header className="flex h-12 items-center justify-between gap-2 border-b px-2">
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <SidebarTrigger className="hidden md:inline-flex" />
            <span className="md:hidden">{brandMark}</span>
          </span>
          {headerRight && <span className="flex shrink-0 items-center gap-1">{headerRight}</span>}
        </header>
        {/* SidebarInset is already the <main> landmark; this is the content column. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:max-w-5xl md:px-8 md:py-6">{children}</div>
        {composer && <div className="border-t px-3 py-2">{composer}</div>}
        <TabBar items={items} active={current} className="md:hidden" />
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Phone tab bar. */
export function TabBar({ items, active, className }: { items: readonly NavItem[]; active?: string; className?: string }) {
  return (
    <nav
      aria-label="Tabs"
      className={cn("grid border-t pb-[env(safe-area-inset-bottom)] text-xs", className)}
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

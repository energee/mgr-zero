// components/mgr/app-shell.tsx — the one navigation shell for staff and
// portal (plan §3, §6). Header on top; below the md container width a bottom
// tab bar (48px targets, safe-area padded), at md and up a left rail with the
// tabs as group headers and their children beneath. Responsive breaks are
// container queries so the design gallery can show a 390px and a 1280px
// instance side by side; (pointer: coarse) sizing comes from app/globals.css.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MgrIcon } from "@/components/mgr-icon";
import { activeTab, PORTAL_NAV, type NavItem } from "@/lib/mgr/nav";
import { cn } from "@/lib/utils";

export type AppShellProps = {
  brand: React.ReactNode;
  items: readonly NavItem[];
  /** Header controls (Search, Me, Sign out). Owned by the layout, not the shell. */
  headerRight?: React.ReactNode;
  /** Composer strip above the tab bar; omitted until the composer ships. */
  composer?: React.ReactNode;
  /** Force the active tab (the gallery renders screens off their real route). */
  active?: string;
  children: React.ReactNode;
};

export function AppShell({ brand, items, headerRight, composer, active, children }: AppShellProps) {
  const pathname = usePathname();
  const current = active ?? activeTab(items, pathname)?.label;
  return (
    <div className="@container/shell flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b bg-card px-4 py-2 font-heading text-base font-semibold">
        <span className="flex min-w-0 items-center gap-2 truncate">
          <MgrIcon size={18} className="shrink-0 fill-primary" />
          {brand}
        </span>
        {headerRight && <span className="flex shrink-0 items-center gap-2 font-sans text-sm font-medium">{headerRight}</span>}
      </header>
      <div className="flex min-h-0 flex-1 @md:flex-row">
        <nav aria-label="Sections" className="hidden w-44 shrink-0 flex-col gap-0.5 border-r bg-card p-3 text-sm @md:flex">
          {items.map((tab) => (
            <div key={tab.label} className="flex flex-col">
              <Link
                href={tab.href}
                className={cn("rounded-sm px-2 py-1.5 font-semibold", tab.label === current ? "text-primary" : "text-foreground")}
                aria-current={tab.label === current ? "page" : undefined}
              >
                {tab.label}
              </Link>
              {tab.children?.map((c) => (
                <Link key={c.href} href={c.href} className="rounded-sm px-2 py-1 pl-4 text-muted-foreground hover:bg-muted hover:text-foreground">
                  {c.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col gap-2 p-4 @md:max-w-2xl">{children}</main>
      </div>
      {composer && <div className="border-t bg-card px-3 py-2">{composer}</div>}
      <TabBar items={items} active={current} className="@md:hidden" />
    </div>
  );
}

/** Phone tab bar; also what E.tabs / E.portal render. */
export function TabBar({ items, active, className }: { items: readonly NavItem[]; active?: string; className?: string }) {
  return (
    <nav
      aria-label="Tabs"
      className={cn("grid border-t bg-card pb-[env(safe-area-inset-bottom)] text-xs", className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          aria-current={t.label === active ? "page" : undefined}
          className={cn("flex min-h-12 items-center justify-center", t.label === active ? "font-semibold text-primary" : "text-muted-foreground")}
        >
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

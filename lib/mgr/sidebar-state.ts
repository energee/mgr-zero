// lib/mgr/sidebar-state.ts — reads the desktop rail's open/collapsed state
// that shadcn's SidebarProvider persists in the `sidebar_state` cookie, so
// every layout that renders AppShell (staff, portal) restores it the same way.
// Server-only: uses next/headers.
import { cookies } from "next/headers";

/** True unless the user last collapsed the rail. */
export async function sidebarOpenFromCookie(): Promise<boolean> {
  return (await cookies()).get("sidebar_state")?.value !== "false";
}

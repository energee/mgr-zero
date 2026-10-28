// app/(app)/routes/labels.ts — the list_routes result shape as the pages read
// it, the one driver label, and the Driver picker's options. A driver shows as
// their roster email (list_team_members), preserving the Driver picker's identity.
import type { DeliveryRow, StopDoc } from "@/lib/commands/delivery";
import { staffRolesLabel } from "@/lib/mgr/labels";

export type Stop = DeliveryRow & { label: string };
export type Route = {
  id: string; name: string | null; delivery_date: string; driver_user_id: string | null; driver_email: string | null; vehicle: string | null; note: string | null;
  departed_at: string | null; returned_at: string | null; stops: Stop[];
};
export type RouteList = { routes: Route[]; anyReturned: boolean; unassigned: StopDoc[]; drivers: Driver[]; today: string };
export type Driver = { user_id: string; email: string; roles: string[] };

/** A route's driver: their roster email, or plainly why there is none. A
 *  driver no longer on the team has no roster email and is never named. */
export function driverLabel(route: Pick<Route, "driver_user_id" | "driver_email">): string {
  if (!route.driver_user_id) return "driver not assigned";
  return route.driver_email ?? "driver not on the team";
}

/** The Driver picker: each eligible member as "email · roles", as Team lists them. A saved
 *  driver who is no longer eligible stays as one more option, so an assigned route never reads
 *  as unassigned; its label says why they can't drive, since save_route refuses them. */
export function driverOptions(drivers: Driver[], route: Pick<Route, "driver_user_id" | "driver_email"> | null): { id: string; label: string }[] {
  const options = drivers.map((driver) => ({ id: driver.user_id, label: driver.email + " · " + staffRolesLabel(driver.roles) }));
  if (!route?.driver_user_id || drivers.some((driver) => driver.user_id === route.driver_user_id)) return options;
  const label = route.driver_email ? route.driver_email + " · can no longer drive" : driverLabel(route);
  return [...options, { id: route.driver_user_id, label }];
}

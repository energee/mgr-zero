// app/(app)/routes/labels.ts — the list_routes result shape as the pages read
// it, and the one driver label. Staff have no display name yet (auth.users
// is not readable under RLS), so a driver shows as the first eight characters
// of their id, as the Team page does.
import type { DeliveryRow, StopDoc } from "@/lib/commands/delivery";

export type Stop = DeliveryRow & { label: string };
export type Route = {
  id: string; name: string | null; delivery_date: string; driver_user_id: string | null; vehicle: string | null; note: string | null;
  departed_at: string | null; returned_at: string | null; stops: Stop[];
};
export type RouteList = { routes: Route[]; unassigned: StopDoc[]; drivers: { user_id: string; role: string }[] };

export const driverLabel = (userId: string | null) => (userId ? `driver ${userId.slice(0, 8)}` : "driver not assigned");

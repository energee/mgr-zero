// lib/commands/today.ts — registered `get_today`: the role-filtered Today
// projection over one typed Postgres reader (get_today_items). The due rules
// live in private.today_candidates; this layer only maps columns and rechecks
// role visibility. No provider code enters the command layer.
import { z } from "zod";
import { defineQuery, unwrap, type StaffRole } from "./registry";

export type TodayItem = {
  reason: "submitted_order" | "pick_due" | "delivery_next" | "fermentation_reading_overdue";
  subjectType: "order" | "delivery" | "occupancy";
  subjectId: string;
  sourceVersion: string;
  safeLabel: string;
  detail: string;
  dueAt: string | null;
  href: string;
  recipientRoles: readonly StaffRole[];
  assignedUserId: string | null;
};

type Row = {
  reason: TodayItem["reason"]; subject_type: TodayItem["subjectType"]; subject_id: string; source_version: string;
  safe_label: string; detail: string; due_at: string | null; href: string; recipient_roles: StaffRole[]; assigned_user_id: string | null;
};

defineQuery({
  name: "get_today",
  description: "Role-filtered work that is assigned, due, or overdue right now (submitted orders, picks due; more reasons as their pages ship)",
  input: z.object({ now: z.string().datetime({ offset: true }).optional() }),
  roles: ["admin", "sales", "warehouse", "brewer"],
  handler: async (ctx, i): Promise<TodayItem[]> => {
    const rows = await unwrap(ctx.db.rpc("get_today_items", { p_brewery: ctx.breweryId, p_now: i.now ?? new Date().toISOString() })) as Row[];
    return rows
      .map((r) => ({
        reason: r.reason, subjectType: r.subject_type, subjectId: r.subject_id, sourceVersion: r.source_version,
        safeLabel: r.safe_label, detail: r.detail, dueAt: r.due_at, href: r.href, recipientRoles: r.recipient_roles,
        assignedUserId: r.assigned_user_id,
      }))
      .filter((it) => ctx.role === "admin" || (it.recipientRoles.includes(ctx.role as StaffRole) && (!it.assignedUserId || it.assignedUserId === ctx.userId)));
  },
});

// Defines provider-neutral chat presentation contracts and runtime notification validation.
import { z } from "zod";

const notificationReasonSchema = z.enum(["submitted_order", "pick_due", "restock_due", "delivery_next", "fermentation_reading_overdue", "invoice_question", "operations_digest"]);

const portableActionSchema = z.object({
  id: z.enum(["open_mgr", "snooze", "mute_reason", "edit_preferences", "refresh"]),
  label: z.string().min(1),
  intentId: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  enabled: z.boolean(),
  disabledReason: z.string().min(1).optional(),
}).strict();

const portableNotificationSchema = z.object({
  reason: notificationReasonSchema,
  urgency: z.enum(["normal", "attention"]),
  subject: z.object({
    type: z.enum(["order", "delivery", "occupancy", "invoice", "digest"]),
    id: z.string().min(1),
    safeLabel: z.string().min(1),
  }).strict(),
  title: z.string().min(1),
  detail: z.string().min(1),
  dueAt: z.string().min(1).nullable(),
  ownerClass: z.enum(["sales", "warehouse", "driver", "brewer", "team"]),
  resolutionKey: z.string().min(1),
  actions: z.array(portableActionSchema),
}).strict();

export type NotificationReason = z.infer<typeof notificationReasonSchema>;
export type PortableAction = z.infer<typeof portableActionSchema>;
export type PortableNotification = Omit<z.infer<typeof portableNotificationSchema>, "actions"> & {
  actions: readonly PortableAction[];
};

export type ChatCapabilitySet = {
  personalDelivery: boolean;
  persistentHome: boolean;
  privateSharedSummary: boolean;
  messageUpdate: boolean;
  modal: boolean;
};

export type ChatPreviewId =
  | "settings-disconnected" | "settings-active" | "link"
  | "app-home" | "personal-dm" | "team-digest" | "preferences"
  | "fermentation-gated" | "order-confirm-gated" | "reauthorization";

export type ChatPreviewFixture = {
  id: ChatPreviewId;
  surface: "settings" | "app_home" | "direct_message" | "private_channel" | "modal";
  title: string;
  eyebrow: string;
  status?: { label: string; tone: "neutral" | "healthy" | "attention" };
  fields: readonly { label: string; value: string }[];
  items: readonly PortableNotification[];
  /** A future-phase control drawn disabled with a visible reason (wireframe `E.gated`). */
  gated?: { label: string; reason: string };
  actions: readonly PortableAction[];
};

export function assertPortableNotification(value: unknown): asserts value is PortableNotification {
  portableNotificationSchema.parse(value);
}

/** The database-owned safe notification projection, before provider rendering. */
export const occurrenceSchema = z.object({
  id: z.string(), reason: notificationReasonSchema, state: z.string(),
  subject_type: portableNotificationSchema.shape.subject.shape.type, subject_id: z.string(),
  urgency: z.enum(["normal", "attention"]), due_at: z.string().nullable(), semantic_key: z.string(),
  payload: z.object({
    safe_label: z.string(), detail: z.string(), href: z.string(), recipient_roles: z.array(z.string()),
    assigned_user_id: z.string().nullable(), window: z.string().optional(),
  }),
});
export type Occurrence = z.infer<typeof occurrenceSchema>;

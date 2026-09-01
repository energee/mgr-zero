// Defines provider-neutral chat presentation contracts and runtime notification validation.
import { z } from "zod";

export type NotificationReason =
  | "submitted_order"
  | "pick_due"
  | "delivery_next"
  | "fermentation_reading_overdue"
  | "operations_digest";

export type PortableAction = {
  id: "open_mgr" | "snooze" | "mute_reason" | "edit_preferences" | "refresh";
  label: string;
  intentId?: string;
  url?: string;
  enabled: boolean;
  disabledReason?: string;
};

export type PortableNotification = {
  reason: NotificationReason;
  urgency: "normal" | "attention";
  subject: { type: "order" | "delivery" | "occupancy" | "digest"; id: string; safeLabel: string };
  title: string;
  detail: string;
  dueAt: string | null;
  ownerClass: "sales" | "warehouse" | "driver" | "brewer" | "team";
  resolutionKey: string;
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

const portableActionSchema = z.object({
  id: z.enum(["open_mgr", "snooze", "mute_reason", "edit_preferences", "refresh"]),
  label: z.string().min(1),
  intentId: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  enabled: z.boolean(),
  disabledReason: z.string().min(1).optional(),
}).strict();

const portableNotificationSchema = z.object({
  reason: z.enum(["submitted_order", "pick_due", "delivery_next", "fermentation_reading_overdue", "operations_digest"]),
  urgency: z.enum(["normal", "attention"]),
  subject: z.object({
    type: z.enum(["order", "delivery", "occupancy", "digest"]),
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

export function assertPortableNotification(value: unknown): asserts value is PortableNotification {
  portableNotificationSchema.parse(value);
}

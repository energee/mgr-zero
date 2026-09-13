import type { ChatHealth, ChatLinkedPerson, ChatLinkIntent, ChatPreferences } from "@/lib/commands/chat";

export const personalChatPreferences: ChatPreferences = { preferences: [{ reason: "submitted_order", enabled: true }, { reason: "pick_due", enabled: true }, { reason: "restock_due", enabled: false }, { reason: "delivery_next", enabled: true }, { reason: "fermentation_reading_overdue", enabled: true }, { reason: "invoice_question", enabled: true }, { reason: "operations_digest", enabled: true }], quietStart: null, quietEnd: null, timezone: "America/New_York", link: null };

export const chatDisconnected: ChatHealth = { installation: null, linkedCount: 0, queue: { queued: 0, retrying: 0 }, lastCallback: null, lastDelivery: null, destinations: [] };
export const chatConnected: ChatHealth = { installation: { id: "installation", workspace: "Demo Brewing", state: "active", scopes: ["chat:write", "im:write", "groups:read"], quietStart: "21:00", quietEnd: "06:00", timezone: "America/New_York", lastError: null }, linkedCount: 3, queue: { queued: 0, retrying: 0 }, lastCallback: "9/12/2026 · 8:42 AM", lastDelivery: "9/12/2026 · 8:43 AM", destinations: [{ id: "operations", channelId: "COPS", state: "active", privacy: "private", reason: null }] };

export const linkedChatPeople: ChatLinkedPerson[] = [
  { id: "avery", name: "Avery Stone", role: "admin", slackIdentity: "UAVERY", linkedAt: "2026-08-29" },
  { id: "casey", name: "Casey Lin", role: "brewer", slackIdentity: "UCASEY", linkedAt: "2026-08-30" },
  { id: "morgan", name: "Morgan Reed", role: "warehouse", slackIdentity: "UMORGAN", linkedAt: "2026-09-02" },
];
export const chatLinkIntent: ChatLinkIntent = { brewery: "Demo Brewing", mgrIdentity: "Avery Stone", slackIdentity: "Avery Stone", workspace: "Demo Brewing", expiresAt: "2026-09-12T12:00:00Z" };

export const chatRecovery: ChatHealth = { installation: { id: "installation", workspace: "Demo Brewing", state: "needs_reauthorization", scopes: ["chat:write", "im:write", "groups:read"], quietStart: "21:00", quietEnd: "06:00", timezone: "America/New_York", lastError: "authorization_expired" }, linkedCount: 3, queue: { queued: 3, retrying: 0 }, lastCallback: "9/12/2026 · 8:42 AM", lastDelivery: "9/12/2026 · 8:43 AM", destinations: [] };

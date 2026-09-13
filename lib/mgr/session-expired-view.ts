// lib/mgr/session-expired-view.ts — view-model for Session expired.
export type SessionExpiredViewModel = {
  note: string;
  queuedTitle: string;
  queuedDetail: string;
  queuedState: string;
};

export const sessionExpiredModel: SessionExpiredViewModel = {
  note: "Your session ended. Eligible queued readings are still on this device.",
  queuedTitle: "Offline outbox",
  queuedDetail: "Sign in as the original user and brewery to retry",
  queuedState: "kept",
};

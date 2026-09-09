// lib/mgr/session-expired-view.ts — view-model for Session expired.
export type SessionExpiredViewModel = {
  note: string;
  queuedTitle: string;
  queuedDetail: string;
  queuedState: string;
};

export function toSessionExpiredViewProps(s: SessionExpiredViewModel): SessionExpiredViewModel {
  return s;
}

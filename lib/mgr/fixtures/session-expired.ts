// lib/mgr/fixtures/session-expired.ts — Session expired snapshot.
import type { SessionExpiredViewModel } from "@/lib/mgr/session-expired-view";

export const sessionExpiredQueued: SessionExpiredViewModel = {
  note: "Your session ended. The 3 queued writes are still here.",
  queuedTitle: "Record movement · Hazy",
  queuedDetail: "waiting",
  queuedState: "queued",
};

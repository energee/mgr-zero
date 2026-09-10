// lib/mgr/fixtures/session-expired.ts — Session expired snapshot.
import type { SessionExpiredViewModel } from "@/lib/mgr/session-expired-view";

export const sessionExpiredQueued: SessionExpiredViewModel = {
  note: "Your session ended. The queued fermentation reading is still here.",
  queuedTitle: "Record fermentation reading · FV3",
  queuedDetail: "waiting",
  queuedState: "queued",
};

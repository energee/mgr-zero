// Shared session-expiry sheet; adapters supply exact or generic outbox facts.
import { WifiDisconnected01Icon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import type { SessionExpiredViewModel } from "@/lib/mgr/session-expired-view";

export type { SessionExpiredViewModel };

export function SessionExpiredView({ model, signInHref }: { model: SessionExpiredViewModel; signInHref?: string }) {
  return (
    <>
      {E.note(model.note)}
      {E.row(model.queuedTitle, model.queuedDetail, model.queuedState, "", WifiDisconnected01Icon)}
      {E.btn("Sign in to retry", "g", signInHref)}
    </>
  );
}

// components/mgr/views/session-expired.tsx — Session expired inventory
// drawing. Live login ?error=expired stays LoginForm.
import { WifiDisconnected01Icon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import type { SessionExpiredViewModel } from "@/lib/mgr/session-expired-view";

export type { SessionExpiredViewModel };

export function SessionExpiredView({ model }: { model: SessionExpiredViewModel }) {
  return (
    <>
      {E.note(model.note)}
      {E.row(model.queuedTitle, model.queuedDetail, model.queuedState, "", WifiDisconnected01Icon)}
      {E.btn("Sign in to retry")}
    </>
  );
}

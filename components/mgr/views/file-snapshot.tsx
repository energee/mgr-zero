"use client";

// Monthly compliance → Save filed snapshot: confirm, then file the period once
// (file_compliance_report). Copy only; the sheet is ConfirmDeleteControl in its
// irreversible tone. The inventory frame and the live FileButton both draw it.
import { ConfirmDeleteControl } from "./confirm-delete";

export function FileSnapshotControl(props: { busy?: boolean; disabled?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Save filed snapshot" tone="irreversible" {...props}
    name="Save these figures as the filed snapshot for this period? A period is filed once and the snapshot cannot be changed."
    warning="MGR does not transmit the filing. File with the TTB or the state yourself. Later corrections post to the period they are saved in."
    dismissLabel="Keep reviewing" busyLabel="Saving…" />;
}

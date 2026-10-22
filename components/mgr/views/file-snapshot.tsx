"use client";

// Monthly compliance → Save filed snapshot: confirm, then record the period's
// filing once (file_compliance_report). Saving records in MGR that the report
// was filed outside it; it sends nothing to TTB or the state (#1143). The sheet
// is ConfirmDeleteControl in its irreversible tone. FileSnapshotForm is step 3's
// note and Save; the inventory frame and the live FileButton both draw it.
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { ConfirmDeleteControl } from "./confirm-delete";

/** The optional note and Save, withheld while `reason` names what is missing.
 *  Without `onFile` (the inventory frame) nothing is saved. */
export function FileSnapshotForm({ note = "", onNote, reason, busy, error, onFile }: {
  note?: string;
  onNote?: (note: string) => void;
  reason: string | null;
  busy?: boolean;
  error?: string | null;
  onFile?: () => Promise<boolean>;
}) {
  return <div className="flex flex-col gap-2">
    {E.edit("Note · optional", note, "text", undefined, { id: "file-note", placeholder: "where and when it was filed", onChange: onNote })}
    {/* A footer row on desktop, so the reason sits beside Save as in every other form. */}
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
      <ConfirmDeleteControl title="Save filed snapshot" tone="irreversible" busy={busy} error={error} reason={reason} onDelete={onFile}
        name="Record these figures as the filed snapshot for this period? A period is filed once, and the snapshot cannot be changed."
        warning="This does not file with TTB or the state; file there yourself first. Later corrections count in the period they are saved in."
        dismissLabel="Keep reviewing" busyLabel="Saving…" />
    </div>
    {/* Stays after the confirm sheet closes: a failed filing must not vanish. */}
    <CommandFormMessage error={error} />
  </div>;
}

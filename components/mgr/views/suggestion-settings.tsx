"use client";

// components/mgr/views/suggestion-settings.tsx — the Material suggestions section of
// Settings: the brewery's TypeSafe key, which is write-only, and the "Suggest kinds for
// new materials" switch. A saved key shows only its last four characters, with Replace
// and Remove; the field is an empty password input, never filled from the server.
// Flipping the switch is the save; a failed save puts it back. The switch stays
// disabled until a key is saved. Once a name has been asked, "Last 30 days" counts how
// the suggestions turned out. Shared by the Settings
// inventory frames and the live SuggestionSettingsForm; the fixture passes no callbacks.
import { useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { suggestionOutcomesLine, type TypeSafeKeyStatus } from "@/lib/mgr/settings-view";

/** `onSaveKey`, `onRemoveKey` and `onEnabledChange` resolve false when the save failed. */
export function SuggestionSettingsView({ status, onSaveKey, onRemoveKey, onEnabledChange, busy = false, error }: {
  status: TypeSafeKeyStatus;
  onSaveKey?: (apiKey: string) => Promise<boolean>;
  onRemoveKey?: () => Promise<boolean>;
  onEnabledChange?: (enabled: boolean) => Promise<boolean>;
  busy?: boolean;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [enabled, setEnabled] = useState(status.enabled);
  // A refresh with a new saved value is the truth (React's "derive state from props" pattern).
  const [seen, setSeen] = useState(status.enabled);
  if (seen !== status.enabled) { setSeen(status.enabled); setEnabled(status.enabled); }
  const flip = (next: boolean) => {
    setEnabled(next);
    void onEnabledChange?.(next).then(ok => { if (!ok) setEnabled(!next); });
  };
  const outcomes = suggestionOutcomesLine(status.outcomes);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !onSaveKey) return;
    if (await onSaveKey(draft.trim())) { setDraft(""); setReplacing(false); }
  };
  return <FieldSet className="min-w-0">
    <FieldLegend><h2 className="font-heading text-xl font-semibold">Material suggestions</h2></FieldLegend>
    {status.saved && !replacing
      ? <>
        {E.row("TypeSafe API key", `Saved · ends in …${status.last4}`)}
        <div className="flex flex-wrap justify-end gap-2">
          {E.btn("Replace", "g", undefined, () => setReplacing(true), { "data-preview-action": true })}
          <ConfirmDeleteControl title="Remove TypeSafe key" triggerLabel="Remove" busy={busy} error={error} busyLabel="Removing…"
            name="Remove this brewery's TypeSafe key?" warning="Kind suggestions stop until an Admin saves a key again. MGR cannot show the removed key."
            onDelete={onRemoveKey} />
        </div>
      </>
      : <form className="flex flex-col gap-2" onSubmit={save}>
        {E.edit("TypeSafe API key", draft, "password", undefined, { id: "typesafe-api-key", autoComplete: "off", disabled: busy, onChange: setDraft })}
        <div className="flex flex-wrap justify-end gap-2">
          {replacing && E.btn("Cancel", "g", undefined, () => { setReplacing(false); setDraft(""); }, { "data-preview-action": true })}
          {E.btn("Save key", draft.trim().length >= 8 && !busy ? "p" : "p disabled", undefined, undefined, { type: "submit", "data-preview-action": true })}
        </div>
      </form>}
    {/* The switch waits for a saved key; the database refuses it otherwise, and removing the key turns it off. */}
    {E.row("Suggest kinds for new materials",
      `${status.saved ? "" : "Save a TypeSafe key first. "}Sends new material names to TypeSafe with this key. Turning it on is your brewery's consent.`,
      E.sw(enabled, "Suggest kinds for new materials", flip, !onEnabledChange || busy || !status.saved))}
    {/* Kept and changed compare each suggested kind with the kind of the material saved under that name. */}
    {outcomes && E.row("Last 30 days", outcomes)}
    <CommandFormMessage error={error} />
  </FieldSet>;
}

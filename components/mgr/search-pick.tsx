// components/mgr/search-pick.tsx — a searchable picker for lists too long for
// E.pick's Select: a trigger button opens a CommandForm (sheet on phones,
// dialog from md) holding a filtered Command list. It is the core of New
// Order's SKU field (OrderSkuPicker) and backs E.searchPick. It is its own
// "use client" module because e.tsx is imported by server-rendered pages.
"use client";

import { useState, type ReactNode } from "react";
import { CommandForm } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type SearchPickOption = { value: string; label: string };

/** The caller supplies options and request feedback. While `optionsReady` is
 *  false nothing says "no match", so a pending read never looks empty; a
 *  retained value missing from `options` still shows `selectedLabel`. */
export function SearchPick({ value, label, options, onChange, title, placeholder, searchPlaceholder, noMatchMessage, emptyMessage = noMatchMessage, selectedLabel, feedback, optionsReady = true, errorId, id, disabled, previewAction }: {
  value: string;
  /** The trigger's accessible name. */
  label: string;
  options: SearchPickOption[];
  onChange?: (value: string) => void;
  /** Heading of the sheet or dialog. */
  title: string;
  /** Trigger text when nothing is picked. */
  placeholder: string;
  searchPlaceholder: string;
  /** Shown when options exist but none match the search. */
  noMatchMessage: string;
  /** Shown when there are no options at all. */
  emptyMessage?: string;
  selectedLabel?: string;
  feedback?: ReactNode;
  optionsReady?: boolean;
  errorId?: string;
  id?: string;
  disabled?: boolean;
  /** Lets an inventory preview keep this picker interaction local. */
  previewAction?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <CommandForm title={title} open={open} onOpenChange={setOpen} previewAction={previewAction}
    trigger={<Button type="button" id={id} disabled={disabled} variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal text-left" aria-label={label} aria-describedby={errorId} data-preview-action={previewAction || undefined}>{options.find(option => option.value === value)?.label ?? (value && selectedLabel ? selectedLabel : placeholder)}</Button>}>
    {feedback}
    <Command><CommandInput placeholder={searchPlaceholder} /><CommandList>{optionsReady && <CommandEmpty>{options.length ? noMatchMessage : emptyMessage}</CommandEmpty>}
      {options.map(option => <CommandItem key={option.value} value={option.value} keywords={[option.label]} onSelect={() => { onChange?.(option.value); setOpen(false); }}>{option.label}</CommandItem>)}
    </CommandList></Command>
  </CommandForm>;
}

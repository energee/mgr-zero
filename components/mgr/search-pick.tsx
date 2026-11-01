// components/mgr/search-pick.tsx — a searchable picker for lists too long for
// E.pick's Select: a trigger button opens a CommandForm (sheet on phones,
// dialog from md) holding a filtered Command list. It is the core of New
// Order's SKU field (OrderSkuPicker) and backs E.searchPick. It is its own
// "use client" module because e.tsx is imported by server-rendered pages.
"use client";

import { useId, useState, type ReactNode } from "react";
import { CommandForm } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/mgr/icon";
import { cn } from "@/lib/utils";

export type SearchPickOption = { value: string; label: string };

/** The caller supplies options and request feedback. While `optionsReady` is
 *  false nothing says "no match", so a pending read never looks empty; a
 *  retained value missing from `options` still shows `selectedLabel`. */
export function SearchPick({ value, label, options, onChange, title, placeholder, searchPlaceholder, noMatchMessage, emptyMessage = noMatchMessage, selectedLabel, feedback, optionsReady = true, errorId, invalid, id, disabled, previewAction, outlined }: {
  value: string;
  /** Field label announced before the trigger's current value or placeholder. */
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
  emptyMessage?: ReactNode;
  selectedLabel?: string;
  feedback?: ReactNode;
  optionsReady?: boolean;
  /** aria-describedby of the trigger: the ids of any messages about the value. */
  errorId?: string;
  /** Marks the trigger invalid (aria-invalid), beside its errorId message. */
  invalid?: boolean;
  id?: string;
  disabled?: boolean;
  /** Lets an inventory preview keep this picker interaction local. */
  previewAction?: boolean;
  /** A select-like trigger for page filters, rather than an inline picked value. */
  outlined?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  // A self-reference would read a caller's <label htmlFor={id}> instead of the
  // button's contents. Name the visible value directly so both are announced.
  const valueId = `${labelId}-value`;
  return <CommandForm title={title} open={open} onOpenChange={setOpen} previewAction={previewAction}
    trigger={
      <Button type="button" id={id} disabled={disabled} variant={outlined ? "outline" : "ghost"}
        className={cn("max-w-full whitespace-normal text-left", outlined
          ? "h-8 w-fit justify-between gap-1.5 border-input bg-transparent py-2 pr-2 pl-2.5 font-normal shadow-none dark:bg-input/30 dark:hover:bg-input/50"
          : "h-auto min-h-11 justify-start")}
        aria-labelledby={`${labelId} ${valueId}`} aria-describedby={errorId} aria-invalid={invalid || undefined} data-preview-action={previewAction || undefined}>
        <span id={labelId} hidden>{label}</span>
        <span id={valueId}>{options.find(option => option.value === value)?.label ?? (value && selectedLabel ? selectedLabel : placeholder)}</span>
        {outlined && <Icon icon={ArrowDown01Icon} className="shrink-0 text-muted-foreground" />}
      </Button>
    }>
    {feedback}
    <Command><CommandInput placeholder={searchPlaceholder} /><CommandList>{optionsReady && <CommandEmpty>{options.length ? noMatchMessage : emptyMessage}</CommandEmpty>}
      {options.map(option => <CommandItem key={option.value} value={option.value} keywords={[option.label]} onSelect={() => { onChange?.(option.value); setOpen(false); }}>{option.label}</CommandItem>)}
    </CommandList></Command>
  </CommandForm>;
}

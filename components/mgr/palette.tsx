"use client";

import type { ReactNode } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/mgr/search-view";

export type PaletteGroup = { heading: string; items: [label: string, detail: string, to?: string][] };

/** Fixture results share the explorer's tap resolver for mouse and keyboard. */
export function Palette({ placeholder, groups, value, onValueChange, onSelect, emptyMessage = "No matches · change the term", before, shouldFilter = true }: {
  placeholder: string; groups: PaletteGroup[]; value?: string; onValueChange?: (value: string) => void;
  onSelect?: (key: string) => void; emptyMessage?: string; before?: ReactNode; shouldFilter?: boolean;
}) {
  return (
    <Command label={placeholder} shouldFilter={shouldFilter} className="h-auto" onKeyDownCapture={(event) => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]')?.click();
    }}>
      <CommandInput
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        value={value?.slice(0, SEARCH_QUERY_MAX_LENGTH)}
        onValueChange={onValueChange ? next => onValueChange(next.slice(0, SEARCH_QUERY_MAX_LENGTH)) : undefined}
      />
      <CommandList>
        {before}
        {emptyMessage && <CommandEmpty>{emptyMessage}</CommandEmpty>}
        {groups.map(({ heading, items }) => (
          <CommandGroup key={heading} heading={heading}>
            {items.map(([label, detail, to]) => (
              <CommandItem key={`${label}:${to ?? detail}`} value={to ?? label} keywords={[label, heading, detail]} onSelect={onSelect ? () => onSelect(to ?? label) : undefined} data-slot="item" aria-label={label} data-to={to} className="min-h-12 cursor-pointer">
                <div className="flex min-w-0 flex-col text-left">
                  <div data-slot="item-title">{label}</div>
                  <span className="text-xs text-muted-foreground">{detail}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

// components/mgr/suggest-input.tsx — a text field that offers suggestions,
// drawn with the shadcn combobox parts so it opens the same list a Select
// does. It backs E.edit's `suggestions`. The typed text is the value: picking
// a suggestion fills it in, and an entry that matches none is still accepted
// (a new brand style, a new signer). Base UI's Autocomplete is the free-text
// sibling of its Combobox and shares every part but the root, so
// components/ui/combobox.tsx styles it. It is its own "use client" module
// because e.tsx is imported by server-rendered pages.
"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Autocomplete } from "@base-ui/react";
import { ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, useComboboxAnchor } from "@/components/ui/combobox";

export function SuggestInput({ suggestions, value, onChange, ...input }: {
  suggestions: string[];
  value: string;
  /** Controlled when given; without it the field keeps its own text (a named form field). */
  onChange?: (value: string) => void;
} & Omit<ComponentProps<typeof ComboboxInput>, "value" | "defaultValue" | "onChange" | "children">) {
  const anchor = useComboboxAnchor();
  const [open, setOpen] = useState(false);
  // Opening shows every suggestion, so a filled field can still be switched;
  // the list narrows only once the user types. Base UI reads a null `filter`
  // as "match everything" and an undefined one as its default text match.
  const [typed, setTyped] = useState(false);

  // Escape closes the list and nothing else. A Radix sheet or dialog around
  // the field listens on the document's capture phase, ahead of this Base UI
  // list, and would close with it and drop the unsaved form.
  useEffect(() => {
    if (!open) return;
    const closeList = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", closeList, true);
    return () => window.removeEventListener("keydown", closeList, true);
  }, [open]);

  return (
    <Autocomplete.Root
      items={suggestions}
      openOnInputClick
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) setTyped(false); }}
      filter={typed ? undefined : null}
      {...(onChange ? { value } : { defaultValue: value })}
      onValueChange={(next, details) => { setTyped(details.reason === "input-change"); onChange?.(next); }}
    >
      <div ref={anchor}><ComboboxInput {...input} /></div>
      {/* pointer-events-auto: a modal Radix sheet turns pointer events off on
          <body>, where this list is portaled. With no match there is nothing
          to offer, so the list is not drawn. */}
      <ComboboxContent anchor={anchor} className="pointer-events-auto data-empty:hidden">
        <ComboboxList>{(suggestion: string) => <ComboboxItem key={suggestion} value={suggestion}>{suggestion}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Autocomplete.Root>
  );
}

// components/mgr/scope-pick.tsx — a labeled pick that scopes a page through
// its URL (#972): each option carries the href that selects it, and picking
// one opens that href, so links, refresh and Back keep the scope. A Select for
// a short fixed list; `search` opens SearchPick for a long one. "All" is an
// option like any other, not a Clear button. A client component because it
// navigates, and E helpers run in server pages.
"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { SearchPick } from "@/components/mgr/search-pick";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** One choice. Radix Select rejects an empty value, so an All row uses "all".
 *  The screen inventory leaves `href` out, and its pick stays inert. */
export type ScopeOption = { value: string; label: string; href?: string };

type ScopePickProps = {
  label: string;
  /** The selected option's value; the URL is the state, so it changes only when the page re-renders. */
  value: string;
  options: ScopeOption[];
  /** A long list (customers): a searchable sheet instead of a Select. */
  search?: boolean;
};

export function ScopePick(props: ScopePickProps) {
  // useRouter throws outside the app router, which is where the inventory's
  // href-less options render in tests; only a pick with somewhere to go asks for it.
  return props.options.some((option) => option.href) ? <RoutedPick {...props} /> : <Pick {...props} />;
}

function RoutedPick(props: ScopePickProps) {
  const router = useRouter();
  return <Pick {...props} open={(href) => router.push(href)} />;
}

function Pick({ label, value, options, search, open }: ScopePickProps & { open?: (href: string) => void }) {
  const id = useId();
  const pick = (next: string) => {
    const href = options.find((option) => option.value === next)?.href;
    if (href) open?.(href);
  };
  const noun = label.toLowerCase();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {search ? (
        <SearchPick id={id} label={label} value={value} options={options} onChange={pick} title={label}
          placeholder={`Select ${noun}`} searchPlaceholder={`Search ${noun}`} noMatchMessage={`No matching ${noun}`} />
      ) : (
        <Select value={value} onValueChange={pick}>
          {/* The label is passed so server markup names the choice before the list mounts. */}
          <SelectTrigger id={id}><SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue></SelectTrigger>
          <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </Field>
  );
}

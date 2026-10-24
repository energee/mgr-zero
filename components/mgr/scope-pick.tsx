// components/mgr/scope-pick.tsx — a labeled E pick that scopes a page through
// its URL (#972): each option carries the href that selects it, and picking
// one opens that href, so links, refresh and Back keep the scope. "All" is an
// option like any other, not a Clear button. A client component because it
// navigates, while the shared E controls own the product control surface.
"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { E } from "@/components/mgr/e";

/** One choice. An All row may be "" (Catalog; E.pick maps it past Radix's
 *  empty-value rule) or "all" (keg history).
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
  return search
    ? E.searchPick(label, value, options, { id, onChange: pick, outlined: true, previewAction: !options.some((option) => option.href) })
    : E.pick(label, value, options, { id, onChange: pick });
}

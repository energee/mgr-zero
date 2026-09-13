import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Palette } from "@/components/mgr/palette";
import type { SearchViewModel } from "@/lib/mgr/search-view";

export type { SearchViewModel };

export function SearchView({
  model,
  value, onValueChange, onSelect, emptyMessage, before, shouldFilter,
}: {
  model: SearchViewModel;
  value?: string; onValueChange?: (value: string) => void; onSelect?: (key: string) => void;
  emptyMessage?: string; before?: ReactNode; shouldFilter?: boolean;
}) {
  return (
    <>
      {model.heading ? E.hd(model.heading, model.sub) : null}
      <Palette placeholder={model.placeholder} groups={model.groups} value={value} onValueChange={onValueChange} onSelect={onSelect} emptyMessage={emptyMessage} before={before} shouldFilter={shouldFilter} />
    </>
  );
}

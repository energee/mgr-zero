// components/mgr/fixture-adapters.tsx — inventory-only adapters that hold
// local state for controlled shared views (FormatView, CatalogCategoriesControl),
// so the explorer drawing is interactive without the views keeping a fixture copy.
// Nothing under app/ imports this; live forms own the same state and call commands.
"use client";

import { cloneElement, useState, type ComponentProps, type ReactElement } from "react";
import type { FormatView } from "@/components/mgr/views/format";
import { CatalogCategoriesControl } from "@/components/mgr/views/catalog-categories";
import { deleteCategory, saveCategory } from "@/lib/mgr/catalog-categories-view";
import { formatControls, type FormatViewModel } from "@/lib/mgr/format-view";

/** Wraps the inventory `<FormatView>` as a child, so the drawn element stays FormatView
 *  (screen-view-composition finds it) while this adapter owns its state. */
export function FormatFixture({ children }: { children: ReactElement<ComponentProps<typeof FormatView>> }) {
  const [model, setModel] = useState(children.props.model);
  const [components, setComponents] = useState([{ id: "", qty: "1" }]);
  const patch = (next: Partial<FormatViewModel>) => setModel(previous => ({ ...previous, ...next }));
  return cloneElement(children, { model, controls: formatControls(model, patch), componentRows: components, onComponentRowsChange: setComponents });
}

export function CatalogCategoriesFixture({ categories }: { categories: string[] }) {
  const [names, setNames] = useState(categories);
  const [error, setError] = useState<string | null>(null);
  return <CatalogCategoriesControl categories={names} error={error}
    onSave={async (next, previous) => {
      const result = saveCategory(names, next, previous);
      if ("error" in result) { setError(result.error); return false; }
      setError(null); setNames(result.names); return true;
    }}
    onDelete={async name => { setNames(deleteCategory(names, name)); return true; }} />;
}

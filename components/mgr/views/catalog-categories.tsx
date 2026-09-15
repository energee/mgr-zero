"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";

type CategoryActions = {
  busy?: boolean;
  onSave: (name: string, previousName?: string) => Promise<boolean>;
  onDelete: (name: string) => Promise<boolean>;
};

function CategoryRow({ name, busy, onSave, onDelete }: CategoryActions & { name: string }) {
  const [draft, setDraft] = useState(name);
  const [confirm, setConfirm] = useState(false);
  return <form className="flex flex-col gap-2" onSubmit={async event => {
    event.preventDefault(); event.stopPropagation();
    if (!busy && draft.trim() && draft.trim() !== name) await onSave(draft.trim(), name);
  }}>
    {E.edit("Category name", draft, "text", undefined, { onChange: setDraft, required: true, disabled: busy, "aria-label": `Rename ${name}` })}
    {confirm ? <>
      <p className="text-sm">Delete <strong>{name}</strong>? Brands using it will block deletion.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void onDelete(name)}>Confirm delete</Button>
      </div>
    </> : <div className="flex justify-end gap-2">
      <Button type="button" variant="destructive" disabled={busy} onClick={() => setConfirm(true)}>Delete</Button>
      <Button type="submit" disabled={busy || !draft.trim() || draft.trim() === name}>Save name</Button>
    </div>}
  </form>;
}

export function CatalogCategoriesControl({ categories, busy = false, error, onSave, onDelete }: {
  categories: string[];
  error?: string | null;
} & Partial<CategoryActions>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [local, setLocal] = useState(categories);
  const [localError, setLocalError] = useState<string | null>(null);
  const names = onSave ? categories : local;
  async function save(next: string, previous?: string) {
    if (onSave) return onSave(next, previous);
    if (names.includes(next)) { setLocalError("A category with this name already exists"); return false; }
    setLocalError(null);
    setLocal(previous ? names.map(value => value === previous ? next : value) : [...names, next]);
    return true;
  }
  async function remove(value: string) {
    if (onDelete) return onDelete(value);
    setLocal(names.filter(name => name !== value));
    return true;
  }
  return <CommandForm title="Manage categories" open={open} onOpenChange={next => { if (!busy) { setOpen(next); setName(""); setLocalError(null); } }}
    trigger={<Button type="button" variant="outline" data-preview-action>Manage categories</Button>}>
    <div className="flex flex-col gap-5" data-preview-action>
      <p className="text-sm text-muted-foreground">Categories are shared by this brewery. Renaming updates every brand using that category. Only unused categories can be deleted.</p>
      <CommandFormMessage error={error ?? localError} />
      <form className="flex flex-col gap-2" onSubmit={async event => {
        event.preventDefault(); event.stopPropagation();
        if (!busy && name.trim() && await save(name.trim())) setName("");
      }}>
        {E.edit("New category", name, "text", undefined, { onChange: setName, required: true, disabled: busy, "aria-label": "New category" })}
        <CommandFormFooter><Button type="submit" disabled={busy || !name.trim()}>Add category</Button></CommandFormFooter>
      </form>
      {names.length ? names.map(value => <CategoryRow key={value} name={value} busy={busy} onSave={save} onDelete={remove} />) : <p className="text-sm text-muted-foreground">No categories yet. Add the first one above.</p>}
    </div>
  </CommandForm>;
}

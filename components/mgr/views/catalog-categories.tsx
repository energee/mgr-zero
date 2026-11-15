"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { Icon } from "@/components/mgr/icon";
import { categoryNameError } from "@/lib/mgr/catalog-categories-view";

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
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">{E.edit("Category name", draft, "text", undefined, { onChange: setDraft, required: true, disabled: busy, hideLabel: true, "aria-label": `Rename ${name}` })}</div>
      <Button type="submit" aria-label={`Save name for ${name}`} disabled={busy || !draft.trim() || draft.trim() === name}>Save</Button>
      <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${name}`} disabled={busy || confirm} onClick={() => setConfirm(true)}><Icon icon={Delete02Icon} /></Button>
    </div>
    {confirm && <div className="flex flex-wrap items-center justify-end gap-2">
      <p className="w-full text-sm">Delete <strong>{name}</strong>? Brands using it will block deletion.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
      <Button type="button" variant="destructive" disabled={busy} onClick={() => void onDelete(name)}>Confirm delete</Button>
    </div>}
  </form>;
}

/** Controlled: the caller owns the list, error, and save/delete (live commands or the inventory adapter). */
export function CatalogCategoriesControl({ categories, busy = false, error, onSave, onDelete }: {
  categories: string[];
  error?: string | null;
} & CategoryActions) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const newId = useId();
  const duplicate = categoryNameError(categories, name);
  async function save(next: string, previous?: string) {
    if (!await onSave(next, previous)) return false;
    toast.success(previous ? "Category updated" : "Category added");
    return true;
  }
  async function remove(value: string) {
    if (!await onDelete(value)) return false;
    toast.success("Category deleted");
    return true;
  }
  return <CommandForm title="Manage categories" open={open} onOpenChange={next => { if (!busy) { setOpen(next); setName(""); } }}
    trigger={<Button type="button" variant="link" size="sm" className="h-auto self-start px-0" data-preview-action>Manage categories</Button>}>
    <div className="flex flex-col gap-5" data-preview-action>
      <p className="text-sm text-muted-foreground">Categories are shared by this brewery. Renaming updates every brand using that category. Only unused categories can be deleted.</p>
      <CommandFormMessage error={error} />
      <form className="flex items-start gap-2" onSubmit={async event => {
        event.preventDefault(); event.stopPropagation();
        if (!busy && name.trim() && !duplicate && await save(name.trim())) setName("");
      }}>
        <div className="min-w-0 flex-1">{E.edit("New category", name, "text", undefined, { id: newId, onChange: setName, required: true, disabled: busy, hideLabel: true, placeholder: "New category", error: duplicate })}</div>
        <Button type="submit" disabled={busy || !name.trim() || Boolean(duplicate)}>Add</Button>
      </form>
      {categories.length ? <div className="flex flex-col gap-2">{categories.map(value => <CategoryRow key={value} name={value} busy={busy} onSave={save} onDelete={remove} />)}</div> : <p className="text-sm text-muted-foreground">No categories yet. Add the first one above.</p>}
    </div>
  </CommandForm>;
}

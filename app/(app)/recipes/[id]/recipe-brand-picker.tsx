// app/(app)/recipes/[id]/recipe-brand-picker.tsx — the recipe's parent row
// with a Brand picker that saves on pick (set_recipe_brand). The brand is a
// pre-fill for new batches; batches already scheduled keep theirs.
"use client";

import { NONE } from "@/components/ui/select";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { brandLabel } from "@/lib/mgr/brand-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Brand = { id: string; name: string; alias?: string | null };

export function RecipeBrandPicker({ recipeId, brandId, brands, parent }: {
  recipeId: string; brandId: string | null; brands: Brand[]; parent: { title: string; detail: string };
}) {
  const { busy, error, run } = useCommandAction();
  return (
    <>
      {E.row(parent.title, parent.detail)}
      {E.pick("Brand · optional", brandId ?? NONE, [{ value: NONE, label: "Not decided" }, ...brands.map((b) => ({ value: b.id, label: brandLabel(b) }))],
        { onChange: (x) => { void run("set_recipe_brand", { recipeId, brandId: x === NONE ? null : x }); }, disabled: busy })}
      <CommandFormMessage error={error} />
    </>
  );
}

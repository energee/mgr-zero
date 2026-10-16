// app/(app)/recipes/[id]/recipe-brand-picker.tsx — the recipe's Brand picker,
// which saves on pick (set_recipe_brand) and toasts "Brand saved" (Sonner's
// polite live region). It stays enabled while a save runs, so focus never
// drops; a pick made meanwhile is ignored. Batches already scheduled keep
// their brand.
"use client";

import { toast } from "sonner";
import { NONE } from "@/components/ui/select";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { brandLabel } from "@/lib/mgr/brand-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Brand = { id: string; name: string; alias?: string | null };

export function RecipeBrandPicker({ recipeId, brandId, brands }: {
  recipeId: string; brandId: string | null; brands: Brand[];
}) {
  const { busy, error, run } = useCommandAction();
  const pick = (x: string) => {
    if (busy) return;
    void run("set_recipe_brand", { recipeId, brandId: x === NONE ? null : x }, () => toast.success("Brand saved"));
  };
  return (
    <>
      {E.pick("Brand · optional", brandId ?? NONE, [{ value: NONE, label: "Not decided" }, ...brands.map((b) => ({ value: b.id, label: brandLabel(b) }))], { onChange: pick })}
      {E.info("Saves when you pick. Batches already scheduled keep their brand.")}
      <CommandFormMessage error={error} />
    </>
  );
}

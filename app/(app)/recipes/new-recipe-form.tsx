// app/(app)/recipes/new-recipe-form.tsx — binds the shared Create recipe
// sheet (components/mgr/views/new-recipe-form.tsx) to create_recipe: a name,
// the brand it is meant to brew (optional — identity is required at
// packaging, not here), and a note. Versions are authored on the recipe's
// own page once it exists.
"use client";

import { useState } from "react";
import { NewRecipeFormView, type NewRecipeBrand, type NewRecipeValues } from "@/components/mgr/views/new-recipe-form";
import { useCommandForm } from "@/lib/commands/use-command-form";

const BLANK: NewRecipeValues = { name: "", brandId: "", note: "" };

export function NewRecipeForm({ brands }: { brands: NewRecipeBrand[] }) {
  const [values, setValues] = useState(BLANK);
  const form = useCommandForm("create_recipe", {
    build: () => ({ name: values.name, brandId: values.brandId || undefined, note: values.note || undefined }),
    reset: () => setValues(BLANK),
  });
  return <NewRecipeFormView open={form.open} onOpenChange={form.setOpen} brands={brands} values={values} onChange={setValues} onSubmit={form.submit} busy={form.submitting} error={form.error} />;
}

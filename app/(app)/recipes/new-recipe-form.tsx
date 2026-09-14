// app/(app)/recipes/new-recipe-form.tsx — binds the shared New recipe form
// (components/mgr/views/new-recipe.tsx) to create_recipe and lands on the
// new recipe's page, where its first version is written.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BLANK_RECIPE, NewRecipeFormView, type NewRecipeBrand } from "@/components/mgr/views/new-recipe";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function NewRecipeForm({ brands }: { brands: NewRecipeBrand[] }) {
  const router = useRouter();
  const [values, setValues] = useState(BLANK_RECIPE);
  const action = useCommandAction();
  const submit = () => void action.run(
    "create_recipe",
    { name: values.name, brandId: values.brandId || undefined, note: values.note || undefined },
    (data) => router.push(`/recipes/${(data as { id: string }).id}`),
  );
  return <NewRecipeFormView brands={brands} values={values} onChange={setValues} onSubmit={submit} busy={action.busy} error={action.error} />;
}

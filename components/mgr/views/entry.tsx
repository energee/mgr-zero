// components/mgr/views/entry.tsx — shared sign-in / reset / set-password body.
import type { ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EntryViewModel } from "@/lib/mgr/entry-view";

export type { EntryViewModel };

export function EntryView({
  model,
  action,
  secondaryAction,
  extraAction,
  primaryHref,
  linkHref,
  hidden,
  defaults = {},
}: {
  model: EntryViewModel;
  action?: (formData: FormData) => void | Promise<void>;
  secondaryAction?: (formData: FormData) => void | Promise<void>;
  extraAction?: (formData: FormData) => void | Promise<void>;
  primaryHref?: string | null;
  linkHref?: string;
  hidden?: ReactNode;
  defaults?: Record<string, string | undefined>;
}) {
  const fields = model.inputs.map((label) => {
    const password = label.toLowerCase().includes("password");
    const name = label === "Email" ? "email" : label === "Your name" ? "name" : "password";
    return (
      <Field key={label}>
        <FieldLabel>{label}</FieldLabel>
        <Input
          aria-label={label}
          name={name}
          type={password ? "password" : label === "Email" ? "email" : "text"}
          autoComplete={label === "Email" ? "email" : label === "Your name" ? "name" : label === "Password" ? "current-password" : "new-password"}
          minLength={label === "Choose a password" ? 8 : undefined}
          defaultValue={defaults[name]}
          required
        />
      </Field>
    );
  });
  const primary = primaryHref === null ? null : primaryHref ? (
    <Button asChild><Link href={primaryHref}>{model.primary}</Link></Button>
  ) : <Button type={action ? "submit" : "button"}>{model.primary}</Button>;
  const controls = (
    <FieldGroup>
      {hidden}
      {fields}
      {primary ? <Field>{primary}</Field> : null}
      {model.secondary ? (
        <Field>
          {secondaryAction
            ? <Button type="submit" formAction={secondaryAction} variant="outline">{model.secondary}</Button>
            : E.btn(model.secondary, "g")}
        </Field>
      ) : null}
    </FieldGroup>
  );

  return (
    <>
      {E.sp()}
      {E.ttl(model.title)}
      {model.note ? E.note(model.note) : null}
      {model.field ? E.fld(model.field.label, model.field.value) : null}
      {action ? <form action={action}>{controls}</form> : controls}
      {model.extraPrimary ? extraAction ? <form action={extraAction}><Button type="submit" variant="outline">{model.extraPrimary}</Button></form> : E.btn(model.extraPrimary, "g") : null}
      {model.link ? linkHref
        ? <Link href={linkHref} className="text-sm underline">{model.link.label}</Link>
        : E.link(model.link.label, model.link.to)
      : null}
      {model.info ? E.info(model.info) : null}
      {E.sp()}
    </>
  );
}

// components/mgr/views/entry.tsx — shared entry forms own email-only secondary validation.
"use client";

import Link from "next/link";
import { E } from "@/components/mgr/e";
import { Icon } from "@/components/mgr/icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import type { EntryViewModel } from "@/lib/mgr/entry-view";
import { passwordChangeErrors, type PasswordErrors } from "@/lib/auth/password";
import type { ReactNode } from "react";
import { Fragment, useId, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

const INPUT_NAMES: Record<string, string> = {
  Email: "email", "Your name": "name",
  "Current password": "currentPassword", "Confirm new password": "confirmPassword",
};

function EntrySubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return E.submit(label, { busy: pendingLabel, submitting: pending, "aria-busy": pending });
}

/** A live text link, or the inventory's inert one naming its screen. */
function textLink(link: { label: string; to: string }, href?: string) {
  return href ? <Link href={href} className="text-sm underline">{link.label}</Link> : E.link(link.label, link.to);
}

export function EntryView({
  model,
  action,
  secondaryAction,
  extraAction,
  primaryHref,
  secondaryHref,
  linkHref,
  switchHref,
  hidden,
  defaults = {},
}: {
  model: EntryViewModel;
  action?: (formData: FormData) => void | Promise<void>;
  secondaryAction?: (formData: FormData) => void | Promise<void>;
  extraAction?: (formData: FormData) => void | Promise<void>;
  primaryHref?: string | null;
  secondaryHref?: string;
  linkHref?: string;
  /** Where model.switchLink goes live; without it the inventory link is inert. */
  switchHref?: string;
  hidden?: ReactNode;
  defaults?: Record<string, string | undefined>;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const passwordRulesId = useId();
  const emailLink = model.secondaryEmailOnly;
  const passwordChange = model.inputs.includes("Confirm new password");
  const recovery = !model.inputs.includes("Current password");
  const [localErrors, setLocalErrors] = useState<PasswordErrors>({});
  function validatePasswordForm(form: HTMLFormElement): PasswordErrors {
    const data = new FormData(form);
    return passwordChangeErrors({
      currentPassword: String(data.get("currentPassword") ?? ""),
      password: String(data.get("password") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    }, recovery);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    if (passwordChange) {
      const errors = validatePasswordForm(event.currentTarget);
      // Every field is now checked locally, so a fixed field drops the server's error too.
      setLocalErrors({ currentPassword: undefined, password: undefined, confirmPassword: undefined, ...errors });
      if (Object.keys(errors).length) {
        event.preventDefault();
        const first = event.currentTarget.elements.namedItem(Object.keys(errors)[0]);
        if (first instanceof HTMLElement) first.focus();
      }
    }
    if (!action) event.preventDefault();
  }
  const fields = model.inputs.map(label => {
    const password = label.toLowerCase().includes("password");
    const name = INPUT_NAMES[label] ?? "password";
    let type = label === "Email" ? "email" : "text";
    if (password && !showPassword) type = "password";
    // Once a field is checked here (blur or submit), its own result replaces the server's error.
    const fieldError = name in localErrors ? localErrors[name as keyof PasswordErrors] : model.passwordErrors?.[name as keyof PasswordErrors];
    return (
      <Fragment key={label}>{E.edit(label, String((defaults[name]) ?? ""), type, undefined, {
        id: passwordChange ? `password-${name}` : undefined,
        name, required: true, minLength: label === "Choose a password" ? 8 : undefined,
        autoComplete: label === "Email" ? "email" : label === "Your name" ? "name" : label === "Password" || label === "Current password" ? "current-password" : "new-password",
        "aria-label": label, "aria-describedby": password && model.passwordRules ? passwordRulesId : undefined, error: fieldError,
        onBlur: passwordChange ? (event) => {
          if (!event.currentTarget.form) return;
          const errors = validatePasswordForm(event.currentTarget.form);
          setLocalErrors(previous => ({ ...previous, [name]: errors[name as keyof PasswordErrors] }));
        } : undefined,
      })}</Fragment>
    );
  });
  let primary: ReactNode = null;
  if (primaryHref) {
    primary = <Button asChild><Link href={primaryHref}>{model.primary}</Link></Button>;
  } else if (primaryHref !== null) {
    primary = model.pendingLabel
      ? <EntrySubmit label={model.primary} pendingLabel={model.pendingLabel} />
      : <Button type={action || emailLink || passwordChange ? "submit" : "button"}>{model.primary}</Button>;
  }
  const controls = (
    <FieldGroup>
      {hidden}
      {model.passwordRules && <FieldDescription id={passwordRulesId}>{model.passwordRules}</FieldDescription>}
      {fields}
      {model.passwordRules && <Button type="button" variant="outline" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide password" : "Show password"}</Button>}
      {primary ? <Field>{primary}</Field> : null}
      {model.secondary ? (
        <Field>
          {secondaryHref ? <Button variant="outline" asChild><Link href={secondaryHref}>{model.secondary}</Link></Button> : secondaryAction || emailLink
            ? <Button type="submit" formAction={secondaryAction} formNoValidate={emailLink} onClick={emailLink ? (event) => {
              // The passwordless action validates email, not the required password.
              const email = event.currentTarget.form?.elements.namedItem("email") as HTMLInputElement;
              if (!email.reportValidity()) event.preventDefault();
            } : undefined} variant="outline">{model.secondary}</Button>
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
      {model.error ? <Alert variant="destructive" role="alert">
        <Icon icon={Alert02Icon} />
        <AlertDescription>{model.error}</AlertDescription>
      </Alert> : null}
      {model.field ? E.fld(model.field.label, model.field.value) : null}
      {/* A local fixture action prevents native GET submission before hydration too. */}
      {action || emailLink || passwordChange ? <form action={action ?? (() => {})} noValidate={passwordChange} onSubmit={submit}>{controls}</form> : controls}
      {model.extraPrimary ? extraAction ? <form action={extraAction}><Button type="submit" variant="outline">{model.extraPrimary}</Button></form> : E.btn(model.extraPrimary, "g") : null}
      {model.link ? textLink(model.link, linkHref) : null}
      {model.switchLink ? textLink(model.switchLink, switchHref) : null}
      {model.info ? E.info(model.info) : null}
      {E.sp()}
    </>
  );
}

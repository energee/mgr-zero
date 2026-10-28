"use client";

import { useActionState } from "react";
import { sendReset } from "@/app/(auth)/actions";
import { EntryView } from "@/components/mgr/views/entry";
import { portalForgotPasswordModel, resetPasswordModel } from "@/lib/mgr/entry-view";

export function ResetForm({ portal }: { portal: boolean }) {
  const [state, submit] = useActionState(sendReset, {});
  const model = {
    ...(portal ? portalForgotPasswordModel : resetPasswordModel),
    error: state.error,
    info: state.sent ? "If that email is on an account, a reset link is on its way." : undefined,
  };
  return <EntryView model={model} action={submit} defaults={{ email: state.email }} secondaryHref={portal ? "/portal/login" : "/login"}
    hidden={portal ? <input type="hidden" name="portal" value="1" /> : null} />;
}

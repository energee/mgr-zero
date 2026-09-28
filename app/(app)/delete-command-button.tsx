"use client";

// Live adapter for a ConfirmDelete-style control: runs one delete or revoke
// command and navigates to `redirect` on success (the deleted record's list,
// or the same page after removing one row). `target` is the deleted record's
// id, so an unresolved delete blocks only that record (see recoveryKey).
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useCommandAction } from "@/lib/commands/use-command-form";

type ControlProps = { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> };

export function DeleteCommandButton({ control: Control, command, input, target, name, redirect }: {
  control: ComponentType<ControlProps>; command: string; input: Record<string, unknown>; target: string; name: string; redirect: string;
}) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  return <Control name={name} busy={busy} error={error} onDelete={() => run(command, input, () => router.replace(redirect), undefined, { target })} />;
}

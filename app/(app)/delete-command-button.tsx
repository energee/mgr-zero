"use client";

// Live adapter for a ConfirmDelete-style control: runs one delete command and
// leaves the deleted record's page on success.
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useCommandAction } from "@/lib/commands/use-command-form";

type ControlProps = { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> };

export function DeleteCommandButton({ control: Control, command, input, name, redirect }: {
  control: ComponentType<ControlProps>; command: string; input: Record<string, unknown>; name: string; redirect: string;
}) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  return <Control name={name} busy={busy} error={error} onDelete={() => run(command, input, () => router.replace(redirect))} />;
}

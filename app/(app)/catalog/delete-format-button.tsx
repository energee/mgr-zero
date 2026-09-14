"use client";

import { useRouter } from "next/navigation";
import { DeleteFormatControl } from "@/components/mgr/views/delete-format";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DeleteFormatButton({ formatId, name }: { formatId: string; name: string }) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  return <DeleteFormatControl name={name} busy={busy} error={error}
    onDelete={() => run("delete_format", { formatId }, () => router.replace("/catalog"))} />;
}

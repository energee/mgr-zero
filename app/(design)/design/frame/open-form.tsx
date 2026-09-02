// app/(design)/design/frame/open-form.tsx — the real CommandForm pinned open
// for gallery frames. Client-side because a server page cannot hand
// CommandForm an onOpenChange function.
"use client";

import { CommandForm } from "@/components/mgr/command-form";

export function OpenCommandForm({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <CommandForm open onOpenChange={() => {}} title={title}>
      {children}
    </CommandForm>
  );
}

import type { ReactNode } from "react";

export function EntrySurface({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full items-end bg-background p-4 md:items-center md:justify-center">
      <div className="flex w-full flex-col gap-2 rounded-xl border bg-card p-6 [&_[data-slot=button]]:w-full md:max-w-[420px]">
        {children}
      </div>
    </div>
  );
}

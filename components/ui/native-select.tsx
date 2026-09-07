// components/ui/native-select.tsx — a plain <select> styled to match Input.
//
// Deliberately not the Radix Select in components/ui/select.tsx: inside a form
// Radix mirrors a programmatic value into a hidden <select> whose options only
// exist once the menu has opened, reads back "" and resets it, so a preselect
// never sticks. Forms that preselect (a location's first bin, a transfer's
// from/to) use this instead; the styling then stays in one place.
import * as React from "react";

import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

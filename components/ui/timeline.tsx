import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Static subset of https://github.com/timdehof/shadcn-timeline (MIT).
export function Timeline({ className, ...props }: ComponentProps<"ol">) {
  return <ol aria-label="Timeline" className={cn("flex flex-col", className)} {...props} />;
}

export function TimelineItem({
  className,
  marker,
  title,
  status = "pending",
  showConnector = true,
  ...props
}: ComponentProps<"li"> & {
  marker: ReactNode;
  title: ReactNode;
  status?: "completed" | "in-progress" | "pending";
  showConnector?: boolean;
}) {
  return (
    <li
      className={cn("grid grid-cols-[4rem_auto_1fr] items-start gap-3", className)}
      aria-current={status === "in-progress" ? "step" : undefined}
      {...props}
    >
      <span className="pt-1 text-right text-xs font-medium text-muted-foreground">{marker}</span>
      <span className="flex flex-col items-center" aria-hidden="true">
        <span className={cn(
          "size-4 rounded-full border-2 ring-4 ring-background",
          status === "pending" ? "border-muted bg-background" : "border-primary bg-primary",
        )} />
        {showConnector && <span className={cn("h-8 w-0.5", status === "completed" ? "bg-primary" : "bg-border")} />}
      </span>
      <span className={cn("pt-0.5 text-sm font-medium capitalize", status === "pending" && "text-muted-foreground")}>{title}</span>
    </li>
  );
}

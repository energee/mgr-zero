"use client";

import { E } from "@/components/mgr/e";

export function RouteErrorView({ reference, onRetry }: { reference?: string; onRetry?: () => void }) {
  return <div className="flex flex-col gap-2 text-sm">
    <p role="alert" className="text-destructive">Something went wrong loading this page.</p>
    {reference && <p className="text-muted-foreground">Reference: {reference}</p>}
    {E.btn("Try again", "g", undefined, onRetry, { "data-preview-action": onRetry ? true : undefined })}
  </div>;
}

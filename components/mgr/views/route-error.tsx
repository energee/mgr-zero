"use client";

import { Button } from "@/components/ui/button";

export function RouteErrorView({ reference, onRetry }: { reference?: string; onRetry?: () => void }) {
  return <div className="flex flex-col gap-2 text-sm">
    <p role="alert" className="text-destructive">Something went wrong loading this page.</p>
    {reference && <p className="text-muted-foreground">Reference: {reference}</p>}
    <Button variant="outline" className="w-fit" onClick={onRetry}>Try again</Button>
  </div>;
}

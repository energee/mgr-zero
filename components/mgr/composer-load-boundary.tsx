"use client";

import { Component, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ComposerActivity } from "@/components/mgr/views/composer-conversation";
import { ComposerStripView } from "@/components/mgr/views/composer-strip";

export class ComposerLoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ComposerUnavailableView({ failed = false, outboxCount, onOutbox, children }: {
  failed?: boolean;
  outboxCount: number;
  onOutbox: () => void;
  children: ReactNode;
}) {
  return <>
    <section aria-label="MGR conversation" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-40 flex-1 px-1 py-3">
        {failed ? <Alert><AlertDescription>
          <p>Ask MGR could not load. Reconnect, then reload this page. Your offline outbox is still available.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>Reload page</Button>
        </AlertDescription></Alert> : <div role="status"><ComposerActivity>Opening your conversation… Your offline outbox is available while Ask MGR loads.</ComposerActivity></div>}
      </div>
    </section>
    {children}
    <ComposerStripView disabled outboxCount={outboxCount} onOutbox={onOutbox} />
  </>;
}

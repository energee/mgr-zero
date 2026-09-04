// components/mgr/screen-embed.tsx — <Screen name="Orders" /> for the customer
// guides: one inventory frame under the prose that describes it, with its own
// Mobile/Desktop switch because a guide has no sticky width bar. The name is
// resolved at build time, so a renamed screen fails the build rather than
// leaving a dead embed. The frame is the same /screens/frame iframe the
// inventory and the explorer draw (components/mgr/screen-width.tsx).
"use client";

import { useState } from "react";
import { screenByName } from "@/lib/mgr/screen-explorer";
import { ScreenFrame, type Mode } from "@/components/mgr/screen-width";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function Screen({ name }: { name: string }) {
  const [mode, setMode] = useState<Mode>("phone");
  const hit = screenByName(name);
  if (!hit) throw new Error(`<Screen name="${name}" />: no such screen in components/mgr/screens.tsx`);
  const [index] = hit;
  return (
    <figure className="not-prose my-6 flex flex-col gap-2">
      <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-label={`${name} width`}>
        <ToggleGroupItem value="phone">Mobile</ToggleGroupItem>
        <ToggleGroupItem value="desk">Desktop</ToggleGroupItem>
      </ToggleGroup>
      <ScreenFrame index={index} title={name} mode={mode} />
    </figure>
  );
}

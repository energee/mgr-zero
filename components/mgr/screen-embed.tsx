// components/mgr/screen-embed.tsx — <Screen name="Orders" /> for the customer
// guides: one inventory frame under the prose that describes it, with its own
// Mobile/Desktop switch because a guide has no sticky width bar. The name is
// resolved at build time, so a renamed screen fails the build rather than
// leaving a dead embed. The frame is the same /screens/frame iframe the
// inventory and the explorer draw (components/mgr/screen-width.tsx).
//
// The switch and frame mount only when the figure nears the viewport (#1491).
// The staff guide embeds over a hundred frames, and their switches were about
// half of its HTML. Until then the figure is an empty box of the frame's
// starting height, so a #section link lands where it will once frames mount.
"use client";

import { useEffect, useRef, useState } from "react";
import { screenByName } from "@/lib/mgr/screen-explorer";
import { ScreenIframe, type Mode } from "@/components/mgr/screen-width";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** The switch row (28px plus the 8px gap) over ScreenIframe's starting 780px. */
const PLACEHOLDER_HEIGHT = 816;

export function Screen({ name }: { name: string }) {
  const [mode, setMode] = useState<Mode>("phone");
  const box = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    // One screen ahead, so a reader scrolling down rarely sees the empty box.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: "100% 0px" });
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const hit = screenByName(name);
  if (!hit) throw new Error(`<Screen name="${name}" />: no such screen in components/mgr/screens.tsx`);
  const [index] = hit;
  if (!near) return <figure ref={box} className="not-prose my-6" style={{ height: PLACEHOLDER_HEIGHT }} aria-label={name} />;
  return (
    <figure className="not-prose my-6 flex flex-col gap-2">
      <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-label={`${name} width`}>
        <ToggleGroupItem value="phone">Mobile</ToggleGroupItem>
        <ToggleGroupItem value="desk">Desktop</ToggleGroupItem>
      </ToggleGroup>
      <ScreenIframe index={index} title={name} mode={mode} />
    </figure>
  );
}

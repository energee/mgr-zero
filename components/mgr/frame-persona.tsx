// components/mgr/frame-persona.tsx — the stand-alone frame drawn as the person
// named in the URL hash (#p=<role>), so the explorer's phone preview shows the
// same persona as its desk view. The route stays static: the hash never
// reaches the server, and with no hash the default person draws.
"use client";

import { useSyncExternalStore } from "react";
import { ScreenFrame } from "@/components/mgr/screen-frame";
import { asPersona } from "@/components/mgr/demo-screens";
import { personaFor } from "@/lib/mgr/demo-personas";
import type { StaffRole } from "@/lib/commands/registry";
import { SCREENS } from "@/components/mgr/screens";
import { parseHash } from "@/lib/mgr/screen-explorer";

const onHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const role = () => parseHash(window.location.hash).p ?? "";

export function FramePersona({ index }: { index: number }) {
  const persona = personaFor(useSyncExternalStore(onHash, role, () => "") as StaffRole);
  return <ScreenFrame screen={asPersona(SCREENS[index], persona)} persona={persona} />;
}

// components/mgr/theme-toggle.tsx — light/dark switch for the Me sheet. Stores
// the choice in localStorage.theme and flips the `.dark` class; app/layout.tsx
// applies the stored (or OS) choice before first paint.
"use client";

import { useSyncExternalStore } from "react";
import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/mgr/icon";
import { Button } from "@/components/ui/button";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  function toggle() {
    document.documentElement.classList.toggle("dark", !dark);
    try { localStorage.theme = dark ? "light" : "dark"; } catch {}
    listeners.forEach((fn) => fn());
  }
  return (
    <Button variant="outline" className="w-full" onClick={toggle} aria-pressed={dark}>
      <Icon icon={dark ? Sun01Icon : Moon01Icon} />
      {dark ? "Switch to light mode" : "Switch to dark mode"}
    </Button>
  );
}

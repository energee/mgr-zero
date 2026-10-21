// components/mgr/theme-toggle.tsx — light/dark switch for the Me sheet. Stores
// the choice in localStorage.theme and flips the `.dark` class; app/layout.tsx
// applies the stored (or OS) choice before first paint. `compact` draws it as
// an icon-only sm control for a toolbar (the /docs/screens width bar). ThemeBoot
// re-applies that choice when the root layout renders on the client (#986).
"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/mgr/icon";
import { Button } from "@/components/ui/button";
import { applyStoredTheme } from "@/lib/mgr/theme";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const isDark = () => document.documentElement.classList.contains("dark");

// Mounted once in app/layout.tsx; a layout effect so the class lands before paint.
export function ThemeBoot() {
  useLayoutEffect(applyStoredTheme, []);
  return null;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  function toggle() {
    document.documentElement.classList.toggle("dark", !dark);
    try { localStorage.theme = dark ? "light" : "dark"; } catch {}
    listeners.forEach((fn) => fn());
  }
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Button
      variant="outline"
      onClick={toggle}
      aria-pressed={dark}
      {...(compact ? { size: "icon-sm" as const, "aria-label": label, title: label } : { className: "w-full" })}
    >
      <Icon icon={dark ? Sun01Icon : Moon01Icon} />
      {compact ? null : label}
    </Button>
  );
}

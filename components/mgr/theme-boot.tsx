// components/mgr/theme-boot.tsx — applies the starting theme (localStorage.theme,
// else the OS preference) as the `.dark` class. app/layout.tsx mounts ThemeBoot
// once in <head>. On a server render it emits an inline script that runs
// before first paint. When Next renders the root layout in the browser instead
// (its bare error document after a notFound() or a throw, #986), that script
// can't run, so the layout effect applies the same rule before paint.
// components/mgr/theme-toggle.tsx flips the class and writes the preference.
"use client";

import { useLayoutEffect } from "react";

// Adds `.dark` when the stored or OS preference asks for it. The empty catch is
// safe: storage can throw (privacy modes), and the light default is correct then.
export function applyStoredTheme() {
  try {
    const t = localStorage.getItem("theme");
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
  } catch {}
}

// The same function as inline script source; it reads only browser globals, so it runs standalone.
export const THEME_BOOT = `(${applyStoredTheme})()`;

export function ThemeBoot() {
  useLayoutEffect(applyStoredTheme, []);
  // This file is a Client Component, so the type check runs where the element
  // is built. The server sends an executable script. A browser render gets
  // text/plain: a data block, so React doesn't warn about a script it can't
  // run (Next's InlineScript pattern, docs/01-app/02-guides/preventing-flash-before-hydration.md).
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_BOOT }}
    />
  );
}

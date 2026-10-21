// lib/mgr/theme.ts — the one rule for the starting theme: localStorage.theme,
// else the OS preference. app/layout.tsx inlines it as THEME_BOOT so a server
// render paints dark before hydration. ThemeBoot
// (components/mgr/theme-toggle.tsx) runs it again on mount, because a page
// that calls notFound() or throws before the shell flushes gets Next's bare
// error document and its root layout renders on the client, where the inline
// script never runs (#986).

// Adds `.dark` when the stored or OS preference asks for it. The empty catch is
// safe: storage can throw (privacy modes), and the light default is correct then.
export function applyStoredTheme() {
  try {
    const t = localStorage.getItem("theme");
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
  } catch {}
}

// The same function as an inline script; it reads only browser globals, so its source runs standalone.
export const THEME_BOOT = `(${applyStoredTheme})()`;

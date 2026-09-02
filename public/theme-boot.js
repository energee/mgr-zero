// public/theme-boot.js — applies the `.dark` class before first paint from
// localStorage.theme or the OS preference. Loaded by app/layout.tsx with
// next/script strategy="beforeInteractive"; components/mgr/theme-toggle.tsx
// flips the class and writes the preference.
(function () {
  try {
    var t = localStorage.theme;
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();

// app/global-error.tsx — the error surface for a throw in app/layout.tsx itself,
// which app/error.tsx can't catch because it renders inside that layout. It
// replaces the root layout, so it brings its own <html>/<body>, the global
// styles, and ThemeBoot for the stored or OS theme (#1069). The body is the
// entry card and RouteError copy that app/error.tsx shows.
"use client";

import { EntrySurface } from "@/components/mgr/entry-surface";
import { RouteError } from "@/components/mgr/route-error";
import { ThemeBoot } from "@/components/mgr/theme-boot";
import "./globals.css";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeBoot />
        <title>MGR</title>
      </head>
      <body className="min-h-full flex flex-col">
        <EntrySurface><RouteError retry={retry} /></EntrySurface>
      </body>
    </html>
  );
}

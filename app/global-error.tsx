// app/global-error.tsx — the error surface for a throw in app/layout.tsx itself,
// which app/error.tsx can't catch because it renders inside that layout. It
// replaces the root layout, so it brings its own <html>/<body>, the global
// styles, and ThemeBoot for the stored or OS theme (#1069). The body is
// app/error.tsx's RootError, so both surfaces show the same card.
"use client";

import { ThemeBoot } from "@/components/mgr/theme-boot";
import RootError from "./error";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeBoot />
        <title>MGR</title>
      </head>
      <body className="min-h-full flex flex-col">
        <RootError error={error} retry={retry} />
      </body>
    </html>
  );
}

// app/(docs)/docs/layout.tsx — Fumadocs docs shell (sidebar from the content
// tree, mobile nav, search) around every guide page. Colors come from the
// app's tokens via ./docs.css, fonts from app/layout.tsx. RootProvider and the
// stylesheet are mounted here, not in the root layout, so the search dialog,
// next-themes and the docs CSS stay off every staff and portal page.
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./docs.css";
import { MgrIcon } from "@/components/mgr-icon";
import { source } from "@/lib/source";

// Same mark and wordmark as the app shells (components/mgr/app-shell.tsx).
const brand = (
  <span className="flex items-center gap-2 font-medium">
    <MgrIcon size={16} className="shrink-0" />
    MGR
  </span>
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // theme disabled: app/layout.tsx's boot script and components/mgr/theme-toggle.tsx own the .dark class
    <RootProvider theme={{ enabled: false }} search={{ preload: false }}>
      <DocsLayout tree={source.getPageTree()} nav={{ title: brand }} themeSwitch={{ enabled: false }}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}

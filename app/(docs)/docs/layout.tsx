// app/(docs)/docs/layout.tsx — Fumadocs docs shell (sidebar from the content
// tree, mobile nav, search) around every guide page. Colors come from the
// app's tokens via fumadocs-ui/css/shadcn.css, fonts from app/layout.tsx.
import { DocsLayout } from "fumadocs-ui/layouts/docs";
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
    <DocsLayout tree={source.getPageTree()} nav={{ title: brand }} themeSwitch={{ enabled: false }}>
      {children}
    </DocsLayout>
  );
}

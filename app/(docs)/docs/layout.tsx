// app/(docs)/docs/layout.tsx — Fumadocs docs shell (sidebar from the content
// tree, mobile nav, search) around every guide page. Colors come from the
// app's tokens via fumadocs-ui/css/shadcn.css, fonts from app/layout.tsx.
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} nav={{ title: "MGR" }} themeSwitch={{ enabled: false }}>
      {children}
    </DocsLayout>
  );
}

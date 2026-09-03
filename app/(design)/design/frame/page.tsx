// app/(design)/design/frame/page.tsx — one screen record rendered full-viewport
// through components/mgr/screen-frame.tsx; the gallery (../page.tsx) embeds this
// in iframes so viewport-driven parts (sidebar, sheets, safe area) behave exactly
// as shipped. Dev-only (../../layout.tsx gates the route group).
import { notFound } from "next/navigation";
import { ScreenFrame } from "@/components/mgr/screen-frame";
import { SCREENS } from "@/components/mgr/screens";

export default async function DesignFrame({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const s = SCREENS[Number((await searchParams).s)];
  if (!s) notFound();
  return <div className="min-h-svh bg-background">
    <ScreenFrame screen={s} />
  </div>;
}

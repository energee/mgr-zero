// app/(frames)/screens/frame/page.tsx — one screen record rendered full-viewport,
// outside the docs shell, so content/docs/screens.mdx can embed it in an iframe at
// a real viewport width. The published inventory needs this because the shell's
// phone/desktop split comes from viewport breakpoints (shadcn's Sidebar switches
// on a media query), so a frame rendered inline in a 390px box would still lay out
// as desktop. /design/frame is the same view but dev-only; this one ships.
import { notFound } from "next/navigation";
import { ScreenFrame } from "@/components/mgr/screen-frame";
import { SCREENS } from "@/components/mgr/screens";

export default async function ScreenFramePage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const s = SCREENS[Number((await searchParams).s)];
  if (!s) notFound();
  return (
    <div className="min-h-svh bg-background">
      <ScreenFrame screen={s} />
    </div>
  );
}

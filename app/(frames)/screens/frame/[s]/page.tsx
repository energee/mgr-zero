// app/(frames)/screens/frame/[s]/page.tsx — one screen record, by inventory
// index, rendered full-viewport outside any shell so the published inventory
// (content/docs/screens.mdx, content/docs/integrations.mdx) can embed it in an iframe
// at a real viewport width: the shell's phone/desktop split comes from viewport
// breakpoints, so a frame rendered inline in a 390px box would still lay out as
// desktop. Static: every index is built once; anything else 404s.
import { notFound } from "next/navigation";
import { FramePersona } from "@/components/mgr/frame-persona";
import { SCREENS } from "@/components/mgr/screens";

export default async function ScreenFramePage({ params }: { params: Promise<{ s: string }> }) {
  const index = Number((await params).s);
  if (!SCREENS[index]) notFound();
  // The persona rides in the hash (#p=<role>); components/mgr/frame-persona.tsx reads it.
  return (
    <div className="min-h-svh bg-background">
      <FramePersona index={index} />
    </div>
  );
}

export const dynamicParams = false;
export const generateStaticParams = () => SCREENS.map((_, i) => ({ s: String(i) }));

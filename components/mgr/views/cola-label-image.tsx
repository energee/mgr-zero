import Image from "next/image";
import { E } from "@/components/mgr/e";

/** The live adapter resolves TTB's session-bound attachment into image bytes. */
export function ColaLabelImageView({ label, src, error, busy, load, compact = false }: {
  label: string; src?: string; error?: string | null; busy?: boolean; load?: () => void; compact?: boolean;
}) {
  return <div className={compact ? "max-w-28" : "flex flex-col gap-2"}>
    {src ? <Image src={src} alt={label} width={480} height={320} unoptimized className={compact ? "h-16 w-24 object-contain" : "max-h-64 w-full object-contain"} />
      : <span className="text-muted-foreground text-xs">{busy ? "Loading label…" : "Label image"}</span>}
    {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
    {!src && !busy && E.btn(error ? "Retry image" : "Load image", "ghost", undefined, load)}
  </div>;
}

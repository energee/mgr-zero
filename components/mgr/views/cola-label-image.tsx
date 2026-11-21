import Image from "next/image";
import { E } from "@/components/mgr/e";

/** A saved label's fixed-size thumbnail at the head of a Catalog row; empty until it loads. A row with no label has none. */
const COLA_THUMB = "h-12 w-16 shrink-0 flex items-center justify-center overflow-hidden rounded-sm bg-muted/40";

/** The live adapter resolves TTB's session-bound attachment into image bytes.
 *  Compact draws the Catalog thumbnail. The live ColaImage fetches it when the
 *  row scrolls into view, so compact offers only Retry, after a failed fetch. */
export function ColaLabelImageView({ label, src, error, busy, load, compact = false }: {
  label: string; src?: string; error?: string | null; busy?: boolean; load?: () => void; compact?: boolean;
}) {
  let verb = "Load image";
  if (error) verb = compact ? "Retry" : "Retry image";
  return <div className={compact ? COLA_THUMB : "flex flex-col gap-2"} title={compact ? error ?? label : undefined}>
    {src ? <Image src={src} alt={label} width={480} height={320} unoptimized className={compact ? "h-full w-full object-contain" : "max-h-64 w-full object-contain"} />
      : !compact && <span className="text-muted-foreground text-xs">{busy ? "Loading label…" : "Label image"}</span>}
    {error && !compact && <p role="alert" className="text-destructive text-xs">{error}</p>}
    {!src && !busy && (!compact || error) && E.btn(verb, "ghost", undefined, load)}
  </div>;
}

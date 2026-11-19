// app/(portal)/portal/cola-label.tsx — a brand's COLA label beside its Shop
// heading. Like Catalog's ColaImage (app/(app)/catalog/cola-image.tsx), it
// loads the stored image (portal_cola_label_image) only once the heading
// scrolls into view, and draws it with ColaLabelImageView; tapping the
// thumbnail opens the full label. A brand with no copy after all draws nothing.
"use client";

import { useEffect, useRef, useState } from "react";
import { CommandForm } from "@/components/mgr/command-form";
import { ColaLabelImageView } from "@/components/mgr/views/cola-label-image";
import { command } from "@/lib/commands/client";
import type { PortalScope } from "@/lib/portal-cart";
import type { ShopLabel } from "@/lib/mgr/shop-view";

export function PortalColaLabel({ label, brand, scope }: { label: ShopLabel; brand: string; scope: PortalScope }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState<{ src?: string | null; error?: string; busy: boolean }>({ busy: false });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const load = () => {
    setImage({ busy: true });
    command(scope.breweryId, "portal_cola_label_image", { brandId: label.brandId }, crypto.randomUUID(), scope)
      .then(result => setImage({ src: (result as { dataUrl: string | null }).dataUrl, busy: false }))
      .catch((error: unknown) => setImage({ error: error instanceof Error ? error.message : "Label unavailable", busy: false }));
  };
  // Once, when the heading first scrolls into view.
  const started = useRef(false);
  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    load();
  });
  if (image.src === null) return null;
  const name = `${brand} label`;
  // Until it loads (or after a failed load, with Retry) the thumbnail is not a button.
  return <div ref={container}>
    {image.src
      ? <CommandForm title={name} open={open} onOpenChange={setOpen}
          trigger={<button type="button" aria-label={`Show the ${name}`}><ColaLabelImageView compact label={name} src={image.src} /></button>}>
          <ColaLabelImageView label={name} src={image.src} />
        </CommandForm>
      : <ColaLabelImageView compact label={name} error={image.error} busy={image.busy} load={load} />}
  </div>;
}

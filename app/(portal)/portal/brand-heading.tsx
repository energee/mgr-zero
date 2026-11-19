// app/(portal)/portal/brand-heading.tsx — the live portal brand heading, on
// Shop and on an order: the shared BrandHeading, plus the brand's stored COLA
// label (portal_cola_label_image, loaded once the heading scrolls into view, as
// Catalog's ColaImage does) and the reference sheet (BrandReferenceView) that
// tapping the thumbnail or the name opens. A brand outside portal_brands draws
// the plain heading; a brand with no label on file draws no thumbnail.
"use client";

import { useEffect, useRef, useState } from "react";
import { CommandForm } from "@/components/mgr/command-form";
import { BrandHeading } from "@/components/mgr/views/brand-heading";
import { BrandReferenceView } from "@/components/mgr/views/brand-reference";
import { ColaLabelImageView } from "@/components/mgr/views/cola-label-image";
import { command } from "@/lib/commands/client";
import { toBrandReference, type PortalBrand } from "@/lib/mgr/brand-reference-view";
import type { PortalScope } from "@/lib/portal-cart";

type Heading = { name: string; alias?: string | null; anchor?: string };

export function PortalBrandHeading({ brand, scope, ...heading }: Heading & { brand?: PortalBrand; scope: PortalScope }) {
  if (!brand) return <BrandHeading {...heading} />;
  return <LiveBrandHeading brand={brand} scope={scope} {...heading} />;
}

function LiveBrandHeading({ brand, scope, ...heading }: Heading & { brand: PortalBrand; scope: PortalScope }) {
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
    command(scope.breweryId, "portal_cola_label_image", { brandId: brand.brandId }, crypto.randomUUID(), scope)
      .then(result => setImage({ src: (result as { dataUrl: string | null }).dataUrl, busy: false }))
      .catch((error: unknown) => setImage({ error: error instanceof Error ? error.message : "Label unavailable", busy: false }));
  };
  // Once, when the heading first scrolls into view, and only for a label on file.
  const started = useRef(false);
  useEffect(() => {
    if (!brand.hasLabel || !visible || started.current) return;
    started.current = true;
    load();
  });
  const name = `${brand.name} label`;
  // Until it loads (or after a failed load, with Retry) the thumbnail is not a button; no copy after all draws none.
  const thumb = !brand.hasLabel || image.src === null ? undefined
    : image.src ? <button type="button" className="block" aria-label={`Show ${brand.name}`} onClick={() => setOpen(true)}><ColaLabelImageView compact label={name} src={image.src} /></button>
    : <ColaLabelImageView compact label={name} error={image.error} busy={image.busy} load={load} />;
  return <div ref={container}>
    <BrandHeading {...heading} thumb={thumb} onOpen={() => setOpen(true)} />
    <CommandForm title={brand.name} open={open} onOpenChange={setOpen}>
      <BrandReferenceView model={toBrandReference(brand)} image={image.src ? <ColaLabelImageView label={name} src={image.src} /> : undefined} />
    </CommandForm>
  </div>;
}

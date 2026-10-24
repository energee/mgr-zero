import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ColaLabelImageView } from "@/components/mgr/views/cola-label-image";
import type { ColaDetails } from "@/lib/ttb/colas";

/** Approved label choices shared by the single-brand form and bulk review. */
export function ColaLabelChoices({ details, imageUrl, busy, images, chooseImage }: {
  details: ColaDetails;
  imageUrl: string;
  busy?: boolean;
  images?: Record<string, ReactNode>;
  chooseImage?: (url: string) => void;
}) {
  return <>
    {E.info(`${details.status} · ${details.approvedOn ?? "Approval date unavailable"} · ${details.permit}`)}
    {!details.images.length && E.info("TTB publishes no label images for this approval. You can save the approval without an image.")}
    {details.images.map(image => {
      const selected = imageUrl === image.url;
      const kind = selected ? "p" : "g";
      const buttonKind = busy ? "g disabled" : kind;
      return <div key={image.url} className="flex flex-col gap-2 border-b pb-3">
        {images?.[image.url] ?? <ColaLabelImageView label={image.label} />}
        {E.btn(selected ? `Selected: ${image.label}` : `Choose ${image.label}`, buttonKind, undefined, () => chooseImage?.(image.url))}
      </div>;
    })}
  </>;
}

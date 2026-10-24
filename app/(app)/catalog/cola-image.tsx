"use client";

import { useEffect, useRef, useState } from "react";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { ColaLabelImageView } from "@/components/mgr/views/cola-label-image";

export function ColaImage({ ttbId, url, label, compact }: { ttbId: string; url: string; label: string; compact?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const image = useCommandQuery<{ dataUrl: string }>("get_cola_image", { ttbId, url }, visible);
  return <div ref={container}><ColaLabelImageView label={label} src={image.data?.dataUrl} error={image.error?.message} busy={image.isFetching} load={() => { void image.refetch(); }} compact={compact} /></div>;
}

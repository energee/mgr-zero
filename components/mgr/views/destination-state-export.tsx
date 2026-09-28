"use client";

import { E } from "@/components/mgr/e";

export function DestinationStateExport({ csv, filename }: { csv: string; filename: string }) {
  return E.btn("Export state transactions", "g", undefined, () => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  });
}

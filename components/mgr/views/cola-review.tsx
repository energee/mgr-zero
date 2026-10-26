import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormFooter } from "@/components/mgr/command-form";
import type { ColaReviewBrand } from "@/lib/mgr/cola-review";
import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";
import { colaUrl } from "@/lib/mgr/brand-approval-view";
import { ColaLabelChoices } from "@/components/mgr/views/cola-label-choices";

import { plural } from "@/lib/mgr/plural";
export type ColaReviewProps = {
  brands: ColaReviewBrand[];
  selected: string[];
  /** Brands with no COLA on file; the review starts with these selected. */
  missing: string[];
  queue?: ColaReviewBrand[];
  index: number;
  saved: number;
  candidates: ColaRecord[];
  ttbId: string;
  details?: ColaDetails;
  imageUrl: string;
  showAll: boolean;
  busy?: boolean;
  messages?: ReactNode;
  images?: Record<string, ReactNode>;
  controls?: {
    toggleBrand: (id: string, checked: boolean) => void;
    selectAll: (checked: boolean) => void;
    selectMissing: (checked: boolean) => void;
    start: () => void;
    chooseCola: (id: string) => void;
    showAll: (checked: boolean) => void;
    chooseImage: (url: string) => void;
    save: () => void;
    skip: () => void;
    close: () => void;
  };
};

/** The same brand selection and per-brand review body in inventory and Catalog. */
export function ColaReviewView({ brands, selected, missing, queue, index, saved, candidates, ttbId, details, imageUrl, showAll, busy, messages, images, controls }: ColaReviewProps) {
  const brand = queue?.[index];
  return <div className="flex flex-col gap-4">
    {!queue ? <>
      {E.info("Select from the brands currently shown in Catalog; brands with no COLA on file start selected. TTB is searched once under your brewery’s permit. A brand’s only matching COLA and its only label image are chosen for you. Nothing is saved until you confirm each brand.")}
      {E.row("Select all shown brands", `${selected.length} selected`, E.sw(selected.length === brands.length && brands.length > 0, "Select all shown brands", controls?.selectAll, busy))}
      {missing.length > 0 && E.row("Select brands with no COLA on file", plural(missing.length, "brand"), E.sw(selected.length === missing.length && missing.every(id => selected.includes(id)), "Select brands with no COLA on file", controls?.selectMissing, busy))}
      {brands.map(brand => <div key={brand.id}>
        {E.row(brand.name, brand.alias, E.sw(selected.includes(brand.id), brand.name, checked => controls?.toggleBrand(brand.id, checked), busy))}
        <p className="text-muted-foreground text-xs">{brand.alias ? `${brand.alias} · ` : ""}{brand.colas.length} COLAs on file{brand.colas.some(cola => cola.image_url) ? " · image saved" : " · no image saved"}</p>
      </div>)}
      {messages}
      <CommandFormFooter>{E.btn(busy ? "Searching TTB…" : `Review ${plural(selected.length, "brand")}`, busy || !selected.length ? "p disabled" : "p", undefined, controls?.start)}</CommandFormFooter>
    </> : !brand ? <>
      {E.info(`Review complete: ${saved} saved, ${queue.length - saved} skipped. Previously saved choices are kept.`)}
      <CommandFormFooter>{E.btn("Done", "p", undefined, controls?.close)}</CommandFormFooter>
    </> : <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{brand.name}</h3>
        <span className="text-xs text-muted-foreground">{index + 1} of {queue.length} · {saved} saved</span>
      </div>
      {brand.colas.some(cola => cola.image_url) && E.info("This brand already has a label image. Saving an existing COLA updates it; choosing a different COLA adds another approval. Other approvals stay on file.")}
      {E.row("Show all COLAs under this permit", "", E.sw(showAll, "Show all COLAs under this permit", controls?.showAll, busy))}
      {candidates.length ? E.searchPick("COLA", ttbId, candidates.map(record => ({ value: record.ttbId, label: `${record.fancifulName || record.brandName} · ${record.ttbId} · ${record.completedOn}` })), { placeholder: "Choose a COLA", onChange: controls?.chooseCola, disabled: busy })
        : E.info("No matching COLAs. Show all COLAs to choose a differently named label, or skip this brand.")}
      {ttbId && <>
        <a href={colaUrl(ttbId)!} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open COLA on TTB</a>
        {!details && busy && E.info("Loading approved label images…")}
      </>}
      {details && <ColaLabelChoices details={details} imageUrl={imageUrl} busy={busy} images={images} chooseImage={controls?.chooseImage} />}
      {messages}
      <CommandFormFooter>
        {E.btn("Skip", busy ? "g disabled" : "g", undefined, controls?.skip)}
        {E.btn(busy ? "Working…" : "Save and next", busy || !details || (details.images.length > 0 && !imageUrl) ? "p disabled" : "p", undefined, controls?.save)}
      </CommandFormFooter>
      <p className="text-muted-foreground text-xs">Each save applies immediately. Closing leaves saved brands intact and discards only unsubmitted choices.</p>
    </>}
  </div>;
}

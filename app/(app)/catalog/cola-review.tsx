"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { ColaReviewView } from "@/components/mgr/views/cola-review";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ColaSearch } from "@/lib/commands/compliance";
import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";
import { colaApprovalInput, defaultColaImage, matchingBrandColas, missingColaIds, soleColaId, type ColaReviewBrand } from "@/lib/mgr/cola-review";
import { ColaImage } from "./cola-image";

export function ColaReview({ brands }: { brands: ColaReviewBrand[] }) {
  const missing = missingColaIds(brands);
  const everyId = brands.map(brand => brand.id);
  const initial = missing.length ? missing : everyId;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(initial);
  const [queue, setQueue] = useState<ColaReviewBrand[]>();
  const [records, setRecords] = useState<ColaRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(0);
  const [ttbId, setTtbId] = useState("");
  const [details, setDetails] = useState<ColaDetails>();
  const [imageUrl, setImageUrl] = useState("");
  const [showAll, setShowAll] = useState(false);
  const action = useCommandAction();
  const brand = queue?.[index];
  let candidates: ColaRecord[] = [];
  if (brand) candidates = showAll ? records : matchingBrandColas(brand, records);

  function changeOpen(next: boolean) {
    if (action.busy) return;
    setOpen(next);
    setSelected(initial);
    setQueue(undefined);
    setRecords([]);
    setIndex(0);
    setSaved(0);
    clearChoice();
  }

  function clearChoice() {
    setTtbId("");
    setDetails(undefined);
    setImageUrl("");
    setShowAll(false);
    action.setError(null);
  }

  // Choosing a COLA loads its labels at once and keeps the saved or only label chosen.
  function choose(target: ColaReviewBrand, id: string) {
    setTtbId(id); setDetails(undefined); setImageUrl(""); action.setError(null);
    if (!id) return;
    void action.run("get_cola_details", { ttbId: id }, data => {
      const found = data as ColaDetails;
      setDetails(found);
      setImageUrl(defaultColaImage(found, target.colas.find(cola => cola.ttb_id === id)?.image_url));
    }, { refresh: false, durable: false });
  }

  // Each brand opens with its only matching COLA already chosen.
  function show(target: ColaReviewBrand | undefined, rows: ColaRecord[]) {
    clearChoice();
    if (target) choose(target, soleColaId(matchingBrandColas(target, rows)));
  }

  function next() {
    setIndex(index + 1);
    show(queue?.[index + 1], records);
  }

  const controls = {
    toggleBrand: (id: string, checked: boolean) => setSelected(ids => checked ? [...ids, id] : ids.filter(value => value !== id)),
    selectAll: (checked: boolean) => setSelected(checked ? everyId : []),
    selectMissing: (checked: boolean) => setSelected(checked ? missing : []),
    start: async () => {
      let rows: ColaRecord[] = [];
      const picked = brands.filter(brand => selected.includes(brand.id));
      const searched = await action.run("search_colas", {}, data => { rows = (data as ColaSearch).rows; }, { refresh: false, durable: false });
      if (!searched) return;
      setRecords(rows);
      setQueue(picked);
      show(picked[0], rows);
    },
    chooseCola: (id: string) => { if (brand) choose(brand, id); },
    showAll: (checked: boolean) => { clearChoice(); setShowAll(checked); },
    chooseImage: setImageUrl,
    save: async () => {
      const record = records.find(record => record.ttbId === ttbId);
      if (!brand || !record || !details) return;
      if (await action.run("upsert_brand_approval", colaApprovalInput(brand, record, details, imageUrl))) { setSaved(value => value + 1); next(); }
    },
    skip: next,
    close: () => changeOpen(false),
  };

  return <CommandForm title="Bulk process COLAs" open={open} onOpenChange={changeOpen} trigger={<Button variant="outline" disabled={!brands.length}>Bulk process COLAs</Button>}>
    <ColaReviewView brands={brands} selected={selected} missing={missing} queue={queue} index={index} saved={saved} candidates={candidates} ttbId={ttbId} details={details} imageUrl={imageUrl} showAll={showAll} busy={action.busy} controls={controls}
      messages={<CommandFormMessage error={action.error} />}
      images={details && Object.fromEntries(details.images.map(image => [image.url, <ColaImage key={`${ttbId}:${image.url}`} ttbId={ttbId} url={image.url} label={image.label} />]))} />
  </CommandForm>;
}

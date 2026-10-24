"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { ColaReviewView } from "@/components/mgr/views/cola-review";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ColaSearch } from "@/lib/commands/compliance";
import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";
import { colaApprovalInput, matchingBrandColas, type ColaReviewBrand } from "@/lib/mgr/cola-review";
import { ColaImage } from "./cola-image";

export function ColaReview({ brands }: { brands: ColaReviewBrand[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(brands.map(brand => brand.id));
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
    setSelected(brands.map(brand => brand.id));
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

  function next() {
    setIndex(value => value + 1);
    clearChoice();
  }

  const controls = {
    toggleBrand: (id: string, checked: boolean) => setSelected(ids => checked ? [...ids, id] : ids.filter(value => value !== id)),
    selectAll: (checked: boolean) => setSelected(checked ? brands.map(brand => brand.id) : []),
    start: () => { void action.run("search_colas", {}, data => {
      const found = data as ColaSearch;
      setRecords(found.rows);
      setQueue(brands.filter(brand => selected.includes(brand.id)));
    }, { refresh: false, durable: false }); },
    chooseCola: (id: string) => { setTtbId(id); setDetails(undefined); setImageUrl(""); action.setError(null); },
    showAll: (checked: boolean) => { clearChoice(); setShowAll(checked); },
    loadDetails: () => { void action.run("get_cola_details", { ttbId }, data => {
      const found = data as ColaDetails;
      setDetails(found);
    }, { refresh: false, durable: false }); },
    chooseImage: setImageUrl,
    save: () => {
      const record = records.find(record => record.ttbId === ttbId);
      if (!brand || !record || !details) return;
      void action.run("upsert_brand_approval", colaApprovalInput(brand, record, details, imageUrl), () => { setSaved(value => value + 1); next(); });
    },
    skip: next,
    close: () => changeOpen(false),
  };

  return <CommandForm title="Bulk process COLAs" open={open} onOpenChange={changeOpen} trigger={<Button variant="outline" disabled={!brands.length}>Bulk process COLAs</Button>}>
    <ColaReviewView brands={brands} selected={selected} queue={queue} index={index} saved={saved} candidates={candidates} ttbId={ttbId} details={details} imageUrl={imageUrl} showAll={showAll} busy={action.busy} controls={controls}
      messages={<CommandFormMessage error={action.error} />}
      images={details && Object.fromEntries(details.images.map(image => [image.url, <ColaImage key={`${ttbId}:${image.url}`} ttbId={ttbId} url={image.url} label={image.label} />]))} />
  </CommandForm>;
}

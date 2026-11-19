"use client";

import { Fragment, useId, useState } from "react";
import { historySizes } from "@/lib/mgr/history-page";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { E } from "@/components/mgr/e";

export type HistoryNavigationProps = {
  currentPage?: number;
  pages?: { number: number; href: string }[];
  previousHref?: string;
  nextHref?: string;
  limit?: number;
  sizeHrefs?: Record<string, string>;
};

export function HistoryNavigation({ currentPage = 1, pages, previousHref, nextHref, limit, sizeHrefs }: HistoryNavigationProps) {
  const id = useId();
  const [selectedSize, setSelectedSize] = useState("50");
  return <Pagination aria-label="History pages" className="flex-wrap items-center justify-end gap-3">
    <div className="mr-auto flex items-center gap-2">
      <label htmlFor={id} className="text-sm whitespace-nowrap">Rows per page</label>
      {E.pick("Rows per page", limit === undefined ? selectedSize : String(limit), historySizes, {
        id, hideLabel: true,
        onChange: sizeHrefs ? size => window.location.assign(sizeHrefs[size]) : setSelectedSize,
      })}
    </div>
    {pages && (pages.length > 1 || currentPage > 1) && <PaginationContent className="flex-wrap justify-end">
      <PaginationItem><PaginationPrevious href={previousHref} aria-disabled={!previousHref} className={!previousHref ? "opacity-50" : undefined} /></PaginationItem>
      {pages.map(({ number, href }, i) => <Fragment key={number}>
        {i > 0 && number - pages[i - 1].number > 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
        <PaginationItem><PaginationLink href={href} aria-label={`Page ${number}`} isActive={currentPage === number}>{number}</PaginationLink></PaginationItem>
      </Fragment>)}
      <PaginationItem><PaginationNext href={nextHref} aria-disabled={!nextHref} className={!nextHref ? "opacity-50" : undefined} /></PaginationItem>
    </PaginationContent>}
  </Pagination>;
}

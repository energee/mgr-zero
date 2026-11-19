"use client";

// components/mgr/similar-names.tsx — the near-duplicate name warning under a name field
// (docs/plans/near-duplicate-names.md). A form calls `check` when its name field loses focus;
// if the brewery already has a close name, `note` is the line to draw under the field. It warns
// and never blocks Save: two real records can have close names.
import Link from "next/link";
import { Fragment, useState } from "react";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { similarNamePage, type SimilarKind, type SimilarName } from "@/lib/mgr/similar-names";

/** "Similar: Joes Bar, Joe's Bar & Grill", each name linking to its record where it has a page. */
export function SimilarNamesNote({ kind, matches }: { kind: SimilarKind; matches: SimilarName[] }) {
  return <p role="status" className="text-sm text-muted-foreground">
    Similar: {matches.map((match, index) => {
      const page = similarNamePage(kind, match.id);
      return <Fragment key={match.id}>
        {index > 0 && ", "}
        {page ? <Link href={page.href} data-to={page.screen} className="text-primary underline underline-offset-4">{match.name}</Link> : match.name}
      </Fragment>;
    })}
  </p>;
}

/** `saved` is the record being edited: it is left out of the answer, and its unchanged name asks nothing. */
export function useSimilarNames(kind: SimilarKind, saved?: { id: string; name: string }) {
  const [asked, setAsked] = useState("");
  const found = useCommandQuery<SimilarName[]>("find_similar_names", { kind, name: asked, excludeId: saved?.id }, asked !== "");
  return {
    check: (name: string) => setAsked(name.trim() === saved?.name.trim() ? "" : name.trim()),
    note: asked !== "" && found.data?.length ? <SimilarNamesNote kind={kind} matches={found.data} /> : undefined,
  };
}

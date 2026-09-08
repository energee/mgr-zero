// app/(app)/denied/page.tsx — Permission denied (screen record): a forbidden
// route says what was refused and offers one way back. Reached from a page
// whose role check refused the visitor, via lib/mgr/denied.ts deniedHref().
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { deniedCopy } from "@/lib/mgr/denied";

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ for?: string; needs?: string }> }) {
  const [{ for: resource = "this page", needs = "" }, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const copy = deniedCopy({ resource, role: brewery.role, needs: needs.split(",").filter(Boolean) });
  return (
    <>
      {E.back("Today", "No access", undefined, "/")}
      {E.note(copy.note)}
      {E.fld("Signed in as", copy.signedInAs)}
      {E.fld("Needs", copy.needs)}
      {E.info(copy.hint)}
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">{E.btn("Back to Today", "p", "/")}{E.btn("Go to Beer", "g", "/beer")}</div>
    </>
  );
}

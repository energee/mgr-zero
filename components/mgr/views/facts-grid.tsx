// components/mgr/views/facts-grid.tsx — a document's read-only facts as one
// two-column <dl> grid, label over value (#909 UX-06): the Order and Invoice
// details both draw their facts with it. A `wide` fact (a note) spans both columns.
import { cn } from "@/lib/utils";

export function FactsGrid({ facts }: { facts: { label: string; value: string; wide?: boolean }[] }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3.5">
      {facts.map((fact) => (
        <div key={fact.label} className={cn("min-w-0", fact.wide && "col-span-2")}>
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

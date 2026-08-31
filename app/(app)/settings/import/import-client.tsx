// app/(app)/settings/import/import-client.tsx — CSV import UI: pick a kind,
// parse a CSV file client-side with papaparse, preview the first 5 rows, then
// submit the parsed rows to the import_csv command in sequential IMPORT_ROW_CAP
// batches (the server rejects a single request over that many rows).
// Results (inserted count + per-row errors) accumulate across chunks.
"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrewery } from "../../brewery-provider";
import { command } from "@/lib/commands/client";
import { IMPORT_ROW_CAP } from "@/lib/commands/import-limits";

const KINDS = [
  { value: "customers", label: "Customers", columns: "name,type,license_no,state,payment_terms" },
  { value: "ship_tos", label: "Ship-tos", columns: "customer_name,label,address1,city,state,zip" },
  { value: "products_skus", label: "Products & SKUs", columns: "product,style,abv,sku_name,package_type,units_per_case,bbl_per_unit" },
  // sku_name alone is ambiguous — skus are only unique per (product, name),
  // e.g. "1/2 bbl keg" exists under many products — so these two kinds also
  // require a `product` column to resolve the right SKU.
  { value: "price_list_items", label: "Price list items", columns: "price_list,product,sku_name,unit_price_cents" },
  { value: "opening_balances", label: "Opening balances", columns: "product,sku_name,location,qty" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

type ImportResult = { inserted: number; errors: { row: number; message: string }[] };

export function ImportClient() {
  const breweryId = useBrewery();
  const [kind, setKind] = useState<Kind>("customers");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeKind = KINDS.find((k) => k.value === kind)!;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResult(null);
    setParseError(null);
    setRows([]);
    if (!file) return;
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.errors.length) {
          setParseError(res.errors[0].message);
          return;
        }
        setRows(res.data);
      },
      error: (err) => setParseError(err.message),
    });
  }

  async function onImport() {
    setSubmitting(true);
    setResult(null);
    // Larger files are chunked into sequential batches (each within the
    // server-side row cap) rather than sent as one request; results
    // accumulate across chunks, with each chunk's row numbers offset so
    // reported errors still point at the right line in the original CSV.
    const accumulated: ImportResult = { inserted: 0, errors: [] };
    try {
      for (let offset = 0; offset < rows.length; offset += IMPORT_ROW_CAP) {
        const chunk = rows.slice(offset, offset + IMPORT_ROW_CAP);
        const data = (await command(breweryId, "import_csv", { kind, rows: chunk })) as ImportResult;
        accumulated.inserted += data.inserted;
        accumulated.errors.push(...data.errors.map((e) => ({ ...e, row: e.row + offset })));
        setResult({ ...accumulated });
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "import failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import CSV</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-kind">What are you importing?</Label>
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v as Kind);
              setRows([]);
              setResult(null);
              setParseError(null);
              setFileName(null);
            }}
          >
            <SelectTrigger id="import-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Expected columns: {activeKind.columns}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="import-file">CSV file</Label>
          <input id="import-file" type="file" accept=".csv,text/csv" onChange={onFileChange} className="text-sm" />
          {fileName && <p className="text-xs text-muted-foreground">{fileName} — {rows.length} row(s) parsed</p>}
        </div>

        {parseError && <p className="text-sm text-red-600">{parseError}</p>}

        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    {Object.keys(rows[0]).map((col) => (
                      <th key={col} className="py-1 pr-3 font-normal">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t">
                      {Object.keys(rows[0]).map((col) => (
                        <td key={col} className="py-1 pr-3">{row[col]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <Button onClick={onImport} disabled={submitting || rows.length === 0}>
            {submitting ? "Importing…" : `Import ${rows.length} row(s)`}
          </Button>
        </div>

        {result && (
          <div className="flex flex-col gap-2 rounded border p-3 text-sm">
            <p className="font-medium">Inserted {result.inserted} row(s).</p>
            {result.errors.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-red-600">{result.errors.length} row(s) failed:</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row + 1}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

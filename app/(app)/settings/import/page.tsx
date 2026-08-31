// app/(app)/settings/import/page.tsx — CSV import entry point. Rendering and
// all interaction (kind select, file parse, preview, submit) live in the
// client component; this page just hosts it.
import { ImportClient } from "./import-client";

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Import</h1>
      <ImportClient />
    </div>
  );
}

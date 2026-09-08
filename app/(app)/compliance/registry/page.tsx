// app/(app)/compliance/registry/page.tsx — Compliance registry (screen record
// Compliance registry): every brand with its approvals and state
// registrations, and the brewery's state licenses, each row with Edit and each
// group with an add sheet (registry-forms.tsx). Sales and Admin.
import { E } from "@/components/mgr/e";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { License, RegistryBrand } from "@/lib/commands/compliance";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { ApprovalForm, LicenseForm, RegistrationForm } from "./registry-forms";

export default async function RegistryPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { brands, licenses } = (await runCommand("get_compliance_registry", {}, ctx)) as { brands: RegistryBrand[]; licenses: License[] };
  const exp = (d: string | null) => (d ? ` · expires ${d}` : "");
  // the sheets need only id + name; the nested lists would otherwise ride along once per row
  const picks = brands.map(({ id, name }) => ({ id, name }));
  return (
    <>
      {E.back("Compliance months", "Registry", undefined, "/compliance")}
      <Tabs defaultValue="brands" className="min-w-0">
      <TabsList variant="solid" className="w-full"><TabsTrigger value="brands">brands</TabsTrigger><TabsTrigger value="licenses">licenses</TabsTrigger></TabsList>
      <TabsContent value="brands">
      {brands.map((b) => {
        const cola = b.approvals.find((a) => a.kind === "cola");
        return (
          <div key={b.id}>
            {E.row(b.name, cola ? `COLA ${cola.ttb_id}${exp(cola.expires_on)}` : "COLA pending", "", cola ? "" : "w")}
            {b.approvals.map((a) => <div key={a.id}>{E.row(`${a.kind === "cola" ? "COLA" : "Formula"} ${a.ttb_id}`, `${a.approved_on ? `approved ${a.approved_on}` : "no approval date"}${exp(a.expires_on)}`, <ApprovalForm key={`${a.id}-${a.ttb_id}-${a.approved_on}-${a.expires_on}`} brands={picks} approval={a} />)}</div>)}
            {b.registrations.map((r) => <div key={r.id}>{E.row(`${r.state} registration`, `${r.registration_no ?? "no number"}${exp(r.expires_on)}`, <RegistrationForm key={`${r.id}-${r.registration_no}-${r.expires_on}`} brands={picks} registration={r} />)}</div>)}
          </div>
        );
      })}
      {brands.length === 0 && E.blank("No brands yet")}
      {brands.length > 0 && <div className="flex gap-2 py-2"><ApprovalForm brands={picks} /><RegistrationForm brands={picks} /></div>}
      </TabsContent>
      <TabsContent value="licenses">
      {licenses.map((l) => <div key={l.id}>{E.row(`${l.state} ${l.kind}`, `${l.license_no ?? "no number"}${exp(l.expires_on)}`, <LicenseForm key={`${l.id}-${l.license_no}-${l.expires_on}`} license={l} />)}</div>)}
      <div className="py-2"><LicenseForm /></div>
      </TabsContent>
      </Tabs>
      {E.note("Order confirmation does not read this registry yet; a warning for an unregistered destination state is planned and will never block.")}
    </>
  );
}

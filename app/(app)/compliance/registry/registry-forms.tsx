// app/(app)/compliance/registry/registry-forms.tsx — the three registry
// sheets (screen records Brand approval, State registration, License):
// upsert_brand_approval, upsert_state_registration, upsert_brewery_state_license.
// Each creates (no row) or edits (a row passed in) through one form.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Approval, License, Registration } from "@/lib/commands/compliance";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Brand = { id: string; name: string };
const field = (id: string, label: string, value: string, set: (v: string) => void, type = "text", required = false) => (
  <div className="flex flex-col gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} type={type} value={value} onChange={(e) => set(e.target.value)} required={required} />
  </div>
);
const brandPick = (id: string, brands: Brand[], value: string, set: (v: string) => void) => (
  <div className="flex flex-col gap-2">
    <Label htmlFor={id}>Brand</Label>
    <Select value={value} onValueChange={set}>
      <SelectTrigger id={id}><SelectValue placeholder="Choose a brand" /></SelectTrigger>
      <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
    </Select>
  </div>
);
const trigger = (edit: boolean, add: string) => edit ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm">{add}</Button>;
// One state object per sheet: the initial values come from the row being edited (or blanks), reset restores them.
function useFields<T extends Record<string, string>>(initial: T) {
  const [v, setV] = useState(initial);
  const set = (k: keyof T) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return { v, set, reset: () => setV(initial) };
}
const orUndef = (s: string) => s || undefined;


export function ApprovalForm({ brands, approval }: { brands: Brand[]; approval?: Approval }) {
  const { v, set, reset } = useFields({ brandId: approval?.brand_id ?? "", kind: approval?.kind ?? "cola", ttbId: approval?.ttb_id ?? "", approvedOn: approval?.approved_on ?? "", expiresOn: approval?.expires_on ?? "" });
  const form = useCommandForm("upsert_brand_approval", {
    build: () => ({ id: approval?.id, brandId: v.brandId, kind: v.kind, ttbId: v.ttbId, approvedOn: orUndef(v.approvedOn), expiresOn: orUndef(v.expiresOn) }),
    reset,
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={approval ? "Brand approval" : "New brand approval"} trigger={trigger(!!approval, "Add approval")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {brandPick("ap-brand", brands, v.brandId, set("brandId"))}
        <div className="flex flex-col gap-2">
          <Label htmlFor="ap-kind">Approval</Label>
          <Select value={v.kind} onValueChange={set("kind")}>
            <SelectTrigger id="ap-kind"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="cola">COLA</SelectItem><SelectItem value="formula">Formula</SelectItem></SelectContent>
          </Select>
        </div>
        {field("ap-ttb", v.kind === "cola" ? "COLA number" : "Formula number", v.ttbId, set("ttbId"), "text", true)}
        <div className="grid grid-cols-2 gap-2">
          {field("ap-approved", "Approved on · optional", v.approvedOn, set("approvedOn"), "date")}
          {field("ap-expires", "Expires · optional", v.expiresOn, set("expiresOn"), "date")}
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !v.brandId || !v.ttbId.trim()}>{form.submitting ? "Saving…" : "Save approval"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  );
}

export function RegistrationForm({ brands, registration }: { brands: Brand[]; registration?: Registration }) {
  const { v, set, reset } = useFields({ brandId: registration?.brand_id ?? "", state: registration?.state ?? "", registrationNo: registration?.registration_no ?? "", expiresOn: registration?.expires_on ?? "" });
  const form = useCommandForm("upsert_state_registration", {
    build: () => ({ brandId: v.brandId, state: v.state.toUpperCase(), registrationNo: orUndef(v.registrationNo), expiresOn: orUndef(v.expiresOn) }),
    reset,
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={registration ? "State registration" : "New state registration"} trigger={trigger(!!registration, "Add registration")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {brandPick("sr-brand", brands, v.brandId, set("brandId"))}
        <div className="grid grid-cols-2 gap-2">
          {field("sr-state", "State (two letters)", v.state, set("state"), "text", true)}
          {field("sr-no", "Registration number · optional", v.registrationNo, set("registrationNo"))}
        </div>
        {field("sr-expires", "Expires · optional", v.expiresOn, set("expiresOn"), "date")}
        <p className="text-sm text-muted-foreground">One record per brand and state: saving again replaces it.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !v.brandId || !/^[A-Za-z]{2}$/.test(v.state)}>{form.submitting ? "Saving…" : "Save registration"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  );
}

export function LicenseForm({ license }: { license?: License }) {
  const { v, set, reset } = useFields({ state: license?.state ?? "", kind: license?.kind ?? "brewery", licenseNo: license?.license_no ?? "", expiresOn: license?.expires_on ?? "" });
  const form = useCommandForm("upsert_brewery_state_license", {
    build: () => ({ state: v.state.toUpperCase(), kind: v.kind, licenseNo: orUndef(v.licenseNo), expiresOn: orUndef(v.expiresOn) }),
    reset,
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={license ? "License" : "New license"} trigger={trigger(!!license, "Add license")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {field("li-state", "State (two letters)", v.state, set("state"), "text", true)}
          {field("li-kind", "Kind", v.kind, set("kind"), "text", true)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field("li-no", "License number · optional", v.licenseNo, set("licenseNo"))}
          {field("li-expires", "Expires · optional", v.expiresOn, set("expiresOn"), "date")}
        </div>
        <p className="text-sm text-muted-foreground">Kind is the license class the state uses: brewery, supplier, direct to consumer. One record per state and kind; it is saved lower-case.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !/^[A-Za-z]{2}$/.test(v.state) || !v.kind.trim()}>{form.submitting ? "Saving…" : "Save license"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  );
}

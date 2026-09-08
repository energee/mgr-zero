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

export function ApprovalForm({ brands, approval }: { brands: Brand[]; approval?: Approval }) {
  const [brandId, setBrandId] = useState(approval?.brand_id ?? "");
  const [kind, setKind] = useState<"cola" | "formula">(approval?.kind ?? "cola");
  const [ttbId, setTtbId] = useState(approval?.ttb_id ?? "");
  const [approvedOn, setApprovedOn] = useState(approval?.approved_on ?? "");
  const [expiresOn, setExpiresOn] = useState(approval?.expires_on ?? "");
  const form = useCommandForm("upsert_brand_approval", {
    build: () => ({ id: approval?.id, brandId, kind, ttbId, approvedOn: approvedOn || undefined, expiresOn: expiresOn || undefined }),
    reset: () => { setBrandId(approval?.brand_id ?? ""); setKind(approval?.kind ?? "cola"); setTtbId(approval?.ttb_id ?? ""); setApprovedOn(approval?.approved_on ?? ""); setExpiresOn(approval?.expires_on ?? ""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={approval ? "Brand approval" : "New brand approval"} trigger={trigger(!!approval, "Add approval")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {brandPick("ap-brand", brands, brandId, setBrandId)}
        <div className="flex flex-col gap-2">
          <Label htmlFor="ap-kind">Approval</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as "cola" | "formula")}>
            <SelectTrigger id="ap-kind"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="cola">COLA</SelectItem><SelectItem value="formula">Formula</SelectItem></SelectContent>
          </Select>
        </div>
        {field("ap-ttb", kind === "cola" ? "COLA number" : "Formula number", ttbId, setTtbId, "text", true)}
        <div className="grid grid-cols-2 gap-2">
          {field("ap-approved", "Approved on · optional", approvedOn, setApprovedOn, "date")}
          {field("ap-expires", "Expires · optional", expiresOn, setExpiresOn, "date")}
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !brandId || !ttbId.trim()}>{form.submitting ? "Saving…" : "Save approval"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  );
}

export function RegistrationForm({ brands, registration }: { brands: Brand[]; registration?: Registration }) {
  const [brandId, setBrandId] = useState(registration?.brand_id ?? "");
  const [state, setState] = useState(registration?.state ?? "");
  const [registrationNo, setRegistrationNo] = useState(registration?.registration_no ?? "");
  const [expiresOn, setExpiresOn] = useState(registration?.expires_on ?? "");
  const form = useCommandForm("upsert_state_registration", {
    build: () => ({ brandId, state: state.toUpperCase(), registrationNo: registrationNo || undefined, expiresOn: expiresOn || undefined }),
    reset: () => { setBrandId(registration?.brand_id ?? ""); setState(registration?.state ?? ""); setRegistrationNo(registration?.registration_no ?? ""); setExpiresOn(registration?.expires_on ?? ""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={registration ? "State registration" : "New state registration"} trigger={trigger(!!registration, "Add registration")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {brandPick("sr-brand", brands, brandId, setBrandId)}
        <div className="grid grid-cols-2 gap-2">
          {field("sr-state", "State (two letters)", state, setState, "text", true)}
          {field("sr-no", "Registration number · optional", registrationNo, setRegistrationNo)}
        </div>
        {field("sr-expires", "Expires · optional", expiresOn, setExpiresOn, "date")}
        <p className="text-sm text-muted-foreground">One record per brand and state: saving again replaces it.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !brandId || !/^[A-Za-z]{2}$/.test(state)}>{form.submitting ? "Saving…" : "Save registration"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  );
}

export function LicenseForm({ license }: { license?: License }) {
  const [state, setState] = useState(license?.state ?? "");
  const [kind, setKind] = useState(license?.kind ?? "brewery");
  const [licenseNo, setLicenseNo] = useState(license?.license_no ?? "");
  const [expiresOn, setExpiresOn] = useState(license?.expires_on ?? "");
  const form = useCommandForm("upsert_brewery_state_license", {
    build: () => ({ state: state.toUpperCase(), kind, licenseNo: licenseNo || undefined, expiresOn: expiresOn || undefined }),
    reset: () => { setState(license?.state ?? ""); setKind(license?.kind ?? "brewery"); setLicenseNo(license?.license_no ?? ""); setExpiresOn(license?.expires_on ?? ""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={license ? "License" : "New license"} trigger={trigger(!!license, "Add license")}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {field("li-state", "State (two letters)", state, setState, "text", true)}
          {field("li-kind", "Kind", kind, setKind, "text", true)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field("li-no", "License number · optional", licenseNo, setLicenseNo)}
          {field("li-expires", "Expires · optional", expiresOn, setExpiresOn, "date")}
        </div>
        <p className="text-sm text-muted-foreground">Kind is the license class the state uses: brewery, supplier, direct to consumer. One record per state and kind.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !/^[A-Za-z]{2}$/.test(state) || !kind.trim()}>{form.submitting ? "Saving…" : "Save license"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  );
}

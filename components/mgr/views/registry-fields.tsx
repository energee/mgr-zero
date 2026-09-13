import type { ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import type { RegistryRowView } from "@/lib/mgr/registry-rows";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type RegistryOption = { value: string; label: string };

export function RegistrySelect({ label, value, options, onChange, disabled, placeholder }: {
  label: string; value: string; options: RegistryOption[];
  onChange?: (value: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function RegistryInput({ label, value, onChange, disabled, required, suggestions }: {
  label: string; value: string; onChange?: (value: string) => void; disabled?: boolean; required?: boolean;
  /** Typed against these as a datalist: an unmatched entry is still accepted. */
  suggestions?: string[];
}) {
  // The options are the datalist's identity (as E.edit does), so two fields
  // offering the same list share one and two lists never collide.
  const listId = suggestions?.length ? `list-${suggestions.join("-").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : undefined;
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-label={label}
        list={listId}
        value={onChange ? value : undefined}
        defaultValue={onChange ? undefined : value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        required={Boolean(required && onChange)}
      />
      {listId ? <datalist id={listId}>{suggestions!.map((o) => <option key={o} value={o} />)}</datalist> : null}
    </Field>
  );
}

/** A list row's action: the live sheet slotted under its key (null suppresses), else the drawn verb. */
export function rowAction(row: RegistryRowView, actions: Record<string, ReactNode>): ReactNode {
  return row.key in actions ? actions[row.key] : (row.verb ? E.act(row.verb) : "");
}

export function RegistryDate({ label, value, onChange }: {
  label: string; value: string; onChange?: (value: string) => void;
}) {
  return onChange
    ? <DatePicker label={label} value={value} onChange={onChange} />
    : <DatePicker label={label} defaultValue={value} />;
}

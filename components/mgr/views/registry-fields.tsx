import type { ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import type { RegistryRowView } from "@/lib/mgr/registry-rows";

export type RegistryOption = { value: string; label: string };

export function RegistrySelect({ label, value, options, onChange, disabled, placeholder }: {
  label: string; value: string; options: RegistryOption[];
  onChange?: (value: string) => void; disabled?: boolean; placeholder?: string;
}) {
  return E.pick(label, value, options, { onChange, disabled, placeholder });
}

export function RegistryInput({ id, label, value, onChange, disabled, required, suggestions, placeholder, description }: {
  id?: string; label: string; value: string; onChange?: (value: string) => void; disabled?: boolean; required?: boolean;
  placeholder?: string;
  /** Typed against these as a datalist: an unmatched entry is still accepted. */
  suggestions?: string[];
  /** A standing note under the field, linked to it through `id` (E.edit). */
  description?: string;
}) {
  return E.edit(label, value, "text", suggestions, { id, onChange, disabled, required: Boolean(required && onChange), placeholder, description });
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

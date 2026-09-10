import { DatePicker } from "@/components/mgr/date-picker";
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

export function RegistryInput({ label, value, onChange, disabled, required }: {
  label: string; value: string; onChange?: (value: string) => void; disabled?: boolean; required?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-label={label}
        value={onChange ? value : undefined}
        defaultValue={onChange ? undefined : value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        required={Boolean(required && onChange)}
      />
    </Field>
  );
}

export function RegistryDate({ label, value, onChange }: {
  label: string; value: string; onChange?: (value: string) => void;
}) {
  return onChange
    ? <DatePicker label={label} value={value} onChange={onChange} />
    : <DatePicker label={label} defaultValue={value} />;
}

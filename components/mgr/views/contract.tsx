// components/mgr/views/contract.tsx — shared Contract sheet body.
import type { ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContractViewModel } from "@/lib/mgr/contract-view";

export type { ContractViewModel };

type Controls = Partial<Record<
  "vendorId" | "materialId" | "quantity" | "starts" | "ends" | "unitCost" | "contractNo",
  (value: string) => void
>>;

function ContractSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange?: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function ContractInput({ label, value, onChange, type = "text", required = false }: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: "text" | "number";
  required?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-label={label}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        value={onChange ? value : undefined}
        defaultValue={onChange ? undefined : value}
        onChange={(event) => onChange?.(event.target.value)}
        required={Boolean(required && onChange)}
      />
    </Field>
  );
}

export function ContractView({ model, controls = {}, messages, footer }: {
  model: ContractViewModel;
  controls?: Controls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const quantity = Number(model.quantity) || 0;

  return (
    <>
      <ContractSelect label="Vendor" value={model.vendorId} options={model.vendorOptions} onChange={controls.vendorId} />
      <ContractSelect label="Material" value={model.materialId} options={model.materialOptions} onChange={controls.materialId} />
      {E.inline(
        <Field key="quantity">
          <FieldLabel>Contract quantity</FieldLabel>
          <ButtonGroup>
            <Button type="button" variant="outline" size="icon" aria-label="Decrease" onClick={() => controls.quantity?.(String(Math.max(0, quantity - 1)))}>−</Button>
            <Input aria-label="Contract quantity" type="number" min={0} step="any" value={controls.quantity ? model.quantity : undefined} defaultValue={controls.quantity ? undefined : model.quantity} onChange={(event) => controls.quantity?.(event.target.value)} required={Boolean(controls.quantity)} />
            <Button type="button" variant="outline" size="icon" aria-label="Increase" onClick={() => controls.quantity?.(String(quantity + 1))}>+</Button>
          </ButtonGroup>
        </Field>,
        <ContractInput key="cost" label="Unit cost ($) · optional" type="number" value={model.unitCost} onChange={controls.unitCost} />,
      )}
      {model.received && E.fld("Received", model.received)}
      {model.onOrder && E.fld("On order", model.onOrder)}
      {model.available && E.fld("Available to release", model.available)}
      {E.inline(
        controls.starts
          ? <DatePicker key="starts" label="Starts · optional" value={model.starts} onChange={controls.starts} />
          : <DatePicker key="starts" label="Starts · optional" defaultValue={model.starts} />,
        controls.ends
          ? <DatePicker key="ends" label="Ends · optional" value={model.ends} onChange={controls.ends} />
          : <DatePicker key="ends" label="Ends · optional" defaultValue={model.ends} />,
      )}
      <ContractInput label="Contract number · optional" value={model.contractNo} onChange={controls.contractNo} />
      {messages}
      {footer !== undefined ? footer : E.btn("Save contract")}
    </>
  );
}

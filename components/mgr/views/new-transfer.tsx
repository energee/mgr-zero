// components/mgr/views/new-transfer.tsx — shared New transfer sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NewTransferViewModel } from "@/lib/mgr/new-transfer-view";

export type { NewTransferViewModel };

export type NewTransferControls = {
  from?: (value: string) => void;
  fromBin?: (value: string) => void;
  to?: (value: string) => void;
  toBin?: (value: string) => void;
  lineSku?: (index: number, value: string) => void;
  lineQty?: (index: number, value: string) => void;
  addLine?: () => void;
  removeLine?: (index: number) => void;
};

function Pick({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[]; onChange?: (value: string) => void; disabled?: boolean }) {
  return <Field><FieldLabel>{label}</FieldLabel><Select value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label}><SelectValue placeholder={label}>{value || undefined}</SelectValue></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
  </Select></Field>;
}

export function NewTransferView({
  model,
  controls = {},
  messages,
  footer,
}: {
  model: NewTransferViewModel;
  controls?: NewTransferControls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.back("Transfers", "New transfer")}
      <Pick label="From" value={model.from} options={model.fromOptions} onChange={controls.from} />
      <Pick label="From bin" value={model.fromBin} options={model.fromBinOptions} onChange={controls.fromBin} disabled={!model.from} />
      <Pick label="To" value={model.to} options={model.toOptions} onChange={controls.to} />
      <Pick label="To bin" value={model.toBin} options={model.toBinOptions} onChange={controls.toBin} disabled={!model.to} />
      <Field><FieldLabel>Lines</FieldLabel>
      {model.lines.map((line, index) => (
        <div key={`${line.title}:${index}`} className="flex gap-2">
          <Select value={controls.lineSku ? line.title : undefined} defaultValue={controls.lineSku ? undefined : line.title} onValueChange={value => controls.lineSku?.(index, value)}>
            <SelectTrigger aria-label={`Line ${index + 1} SKU`}><SelectValue placeholder="SKU">{line.title || undefined}</SelectValue></SelectTrigger>
            <SelectContent>{model.skuOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
          <Input aria-label={`Line ${index + 1} qty`} type="number" min="0" step="any" className="w-24" value={controls.lineQty ? String(line.qty) : undefined} defaultValue={controls.lineQty ? undefined : line.qty} onChange={event => controls.lineQty?.(index, event.target.value)} />
          {model.lines.length > 1 ? <Button type="button" variant="ghost" onClick={() => controls.removeLine?.(index)}>Remove</Button> : null}
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={controls.addLine}>Add line</Button>
      </Field>
      {messages}
      {footer !== undefined ? footer : E.btn("Create transfer")}
    </>
  );
}

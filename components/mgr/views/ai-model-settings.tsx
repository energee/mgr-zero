"use client";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, useComboboxSearch } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { InputGroupAddon } from "@/components/ui/input-group";
import { AiModelIcon } from "@/components/mgr/ai-model-icon";
import { modelMatches, modelProvider, type GatewayModelOption } from "@/lib/chat/models";

/** The Ask MGR section of Settings: its own form, named by its legend, saved only by Save AI model (Enter submits it). */
export function AiModelSettingsView({ value, models, onChange, onSubmit, busy = false, error }: {
  value: string;
  models: GatewayModelOption[];
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  busy?: boolean;
  error?: string;
}) {
  const known = models.find((model) => model.id === value);
  const selected = known ?? { id: value, name: value };
  const options = known ? models : [selected, ...models];
  const { open, anchor, props: search } = useComboboxSearch(selected.name);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
    <FieldSet className="min-w-0">
      <FieldLegend><h2 className="font-heading text-xl font-semibold">Ask MGR</h2></FieldLegend>
      <FieldGroup>
        <Field data-disabled={!onChange || busy || models.length === 0 || undefined} data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="brewery-ai-model">AI model</FieldLabel>
          <Combobox
            items={options}
            value={selected}
            disabled={!onChange || busy || models.length === 0}
            itemToStringLabel={(model) => model.name}
            itemToStringValue={(model) => model.id}
            onValueChange={(model) => model && onChange?.(model.id)}
            filter={modelMatches}
            {...search}
          >
            <div ref={anchor}>
              <ComboboxInput id="brewery-ai-model" placeholder="Search models…" aria-invalid={Boolean(error) || undefined}>
                {!open && <InputGroupAddon align="inline-start"><AiModelIcon modelId={selected.id} /></InputGroupAddon>}
              </ComboboxInput>
            </div>
            <ComboboxContent anchor={anchor}>
              <ComboboxEmpty>No model found.</ComboboxEmpty>
              <ComboboxList>{(model: GatewayModelOption) => <ComboboxItem key={model.id} value={model}><AiModelIcon modelId={model.id} /><span className="grid gap-0.5"><span>{model.name}</span><span className="text-xs capitalize text-muted-foreground">{modelProvider(model.id)}</span></span></ComboboxItem>}</ComboboxList>
            </ComboboxContent>
          </Combobox>
          <FieldDescription>Used by Ask MGR for everyone at this brewery.</FieldDescription>
          {models.length === 0 && <FieldDescription>The Gateway model catalog is unavailable. The saved model remains active.</FieldDescription>}
          <FieldError>{error}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" className="w-full @min-[24rem]:w-auto @min-[24rem]:self-end" disabled={!onSubmit || busy || models.length === 0}>{busy ? "Saving…" : "Save AI model"}</Button>
    </FieldSet>
  </form>;
}

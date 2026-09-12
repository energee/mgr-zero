"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, useComboboxAnchor } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroupAddon } from "@/components/ui/input-group";
import { AiModelIcon } from "@/components/mgr/ai-model-icon";
import type { GatewayModelOption } from "@/lib/chat/models";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const priceLabel = (model?: GatewayModelOption) => model?.pricing
  ? `Input ${usd.format(Number(model.pricing.input) * 1_000_000)} · Output ${usd.format(Number(model.pricing.output) * 1_000_000)} / 1M tokens`
  : null;

export function AiModelSettingsView({ value, models, onChange, onSubmit, busy = false, error }: {
  value: string;
  models: GatewayModelOption[];
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  busy?: boolean;
  error?: string;
}) {
  const options = models.some((model) => model.id === value) ? models : [{ id: value, name: value }, ...models];
  const selected = options.find((model) => model.id === value);
  const selectedPrice = priceLabel(selected);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchor = useComboboxAnchor();
  return <section className="flex flex-col gap-3" aria-label="AI model settings">
    <FieldGroup>
      <Field data-disabled={!onChange || busy || models.length === 0 || undefined} data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="brewery-ai-model">AI model</FieldLabel>
        <Combobox
          items={options}
          value={selected ?? null}
          open={open}
          inputValue={open ? query : selected?.name ?? value}
          disabled={!onChange || busy || models.length === 0}
          itemToStringLabel={(model) => model.name}
          itemToStringValue={(model) => model.id}
          onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) setQuery(""); }}
          onInputValueChange={setQuery}
          onValueChange={(model) => model && onChange?.(model.id)}
        >
          <div ref={anchor}>
            <ComboboxInput id="brewery-ai-model" placeholder="Search models…" aria-invalid={Boolean(error) || undefined}>
              {selected && !open && <InputGroupAddon align="inline-start"><AiModelIcon modelId={selected.id} /></InputGroupAddon>}
            </ComboboxInput>
          </div>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No model found.</ComboboxEmpty>
            <ComboboxList>{(model: GatewayModelOption) => {
              const price = priceLabel(model);
              return <ComboboxItem key={model.id} value={model}><AiModelIcon modelId={model.id} /><span className="grid gap-0.5"><span>{model.name}</span>{price && <span className="text-xs text-muted-foreground">{price}</span>}</span></ComboboxItem>;
            }}</ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>{selectedPrice && <>{selectedPrice}. </>}Used by Ask MGR for everyone at this brewery. <a href="https://vercel.com/ai-gateway/models" target="_blank" rel="noreferrer">View models and promotions.</a></FieldDescription>
        {models.length === 0 && <FieldDescription>The Gateway model catalog is unavailable. The saved model remains active.</FieldDescription>}
        <FieldError>{error}</FieldError>
      </Field>
    </FieldGroup>
    <Button type="button" disabled={!onSubmit || busy || models.length === 0} onClick={onSubmit}>{busy ? "Saving…" : "Save AI model"}</Button>
  </section>;
}

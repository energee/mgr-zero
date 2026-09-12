import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  return <section className="flex flex-col gap-3" aria-label="AI model settings">
    <FieldGroup>
      <Field data-disabled={!onChange || busy || models.length === 0 || undefined} data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="brewery-ai-model">AI model</FieldLabel>
        <Select value={value} disabled={!onChange || busy || models.length === 0} onValueChange={onChange}>
          <SelectTrigger id="brewery-ai-model" className="w-full" aria-invalid={Boolean(error) || undefined}>
            <SelectValue>{selected ? <><AiModelIcon modelId={selected.id} />{selected.name}</> : value}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
            <SelectGroup>
              {options.map((model) => {
                const price = priceLabel(model);
                return <SelectItem key={model.id} value={model.id}><AiModelIcon modelId={model.id} /><span className="grid gap-0.5"><span>{model.name}</span>{price && <span className="text-xs text-muted-foreground">{price}</span>}</span></SelectItem>;
              })}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{selectedPrice && <>{selectedPrice}. </>}Used by Ask MGR for everyone at this brewery. <a href="https://vercel.com/ai-gateway/models" target="_blank" rel="noreferrer">View models and promotions.</a></FieldDescription>
        {models.length === 0 && <FieldDescription>The Gateway model catalog is unavailable. The saved model remains active.</FieldDescription>}
        <FieldError>{error}</FieldError>
      </Field>
    </FieldGroup>
    <Button type="button" disabled={!onSubmit || busy || models.length === 0} onClick={onSubmit}>{busy ? "Saving…" : "Save AI model"}</Button>
  </section>;
}

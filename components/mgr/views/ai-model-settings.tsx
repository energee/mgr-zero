import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { GatewayModelOption } from "@/lib/chat/models";

export function AiModelSettingsView({ value, models, onChange, onSubmit, busy = false, error }: {
  value: string;
  models: GatewayModelOption[];
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  busy?: boolean;
  error?: string;
}) {
  const options = models.some((model) => model.id === value) ? models : [{ id: value, name: value }, ...models];
  return <section className="flex flex-col gap-3" aria-label="AI model settings">
    <div className="flex flex-col gap-2">
      <Label htmlFor="brewery-ai-model">AI model</Label>
      <select id="brewery-ai-model" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={value} disabled={!onChange || busy || models.length === 0} onChange={(event) => onChange?.(event.target.value)}>
        {options.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}
      </select>
      <p className="text-sm text-muted-foreground">Used by Ask MGR for everyone at this brewery.</p>
      {models.length === 0 && <p className="text-sm text-muted-foreground">The Gateway model catalog is unavailable. The saved model remains active.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    <Button type="button" disabled={!onSubmit || busy || models.length === 0} onClick={onSubmit}>{busy ? "Saving…" : "Save AI model"}</Button>
  </section>;
}

// components/mgr/views/vendor.tsx — shared Vendor sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VendorViewModel } from "@/lib/mgr/vendor-view";

export type { VendorViewModel };

export function VendorView({
  model,
  controls = {},
  messages,
  footer,
}: {
  model: VendorViewModel;
  controls?: {
    name?: (value: string) => void;
    email?: (value: string) => void;
    phone?: (value: string) => void;
    terms?: (value: string) => void;
    leadDays?: (value: string) => void;
  };
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const controlled = (key: keyof typeof controls) => Boolean(controls[key]);
  const lead = Number(model.leadDays) || 0;
  return (
    <>
      <Field>
        <FieldLabel>Vendor name</FieldLabel>
        <Input
          aria-label="Vendor name"
          value={controlled("name") ? model.name : undefined}
          defaultValue={controlled("name") ? undefined : model.name}
          onChange={(event) => controls.name?.(event.target.value)}
          required={controlled("name")}
        />
      </Field>
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input
          aria-label="Email"
          type="email"
          value={controlled("email") ? model.email : undefined}
          defaultValue={controlled("email") ? undefined : model.email}
          onChange={(event) => controls.email?.(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>Phone</FieldLabel>
        <Input
          aria-label="Phone"
          type="tel"
          value={controlled("phone") ? model.phone : undefined}
          defaultValue={controlled("phone") ? undefined : model.phone}
          onChange={(event) => controls.phone?.(event.target.value)}
        />
      </Field>
      {E.inline(
        <Field key="terms">
          <FieldLabel>Terms</FieldLabel>
          <Select
            value={controlled("terms") ? model.terms : undefined}
            defaultValue={controlled("terms") ? undefined : model.terms}
            onValueChange={(value) => controls.terms?.(value)}
          >
            <SelectTrigger aria-label="Terms"><SelectValue /></SelectTrigger>
            <SelectContent>
              {model.termsOptions.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>,
        <Field key="lead">
          <FieldLabel>Lead time (days)</FieldLabel>
          <ButtonGroup>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Decrease"
              onClick={() => controls.leadDays?.(String(Math.max(0, lead - 1)))}
            >
              −
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              aria-label="Lead time (days)"
              className="w-14 appearance-none text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={controlled("leadDays") ? model.leadDays : undefined}
              defaultValue={controlled("leadDays") ? undefined : model.leadDays}
              onChange={(event) => controls.leadDays?.(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Increase"
              onClick={() => controls.leadDays?.(String(lead + 1))}
            >
              +
            </Button>
          </ButtonGroup>
        </Field>,
      )}
      {E.info("Planning uses this lead time to calculate when to buy. Received orders show a separate observed average.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save vendor")}
    </>
  );
}

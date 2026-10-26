import { E, type FieldControls } from "@/components/mgr/e";
import { US_STATE_CODES } from "@/lib/mgr/enums";

const stateOptions = US_STATE_CODES.map(value => ({ value, label: value }));

/** The allowed state list used by customer addresses and compliance records. */
export function UsStateField({ value, controls, label = "State" }: { value: string; controls?: FieldControls; label?: string }) {
  const invalid = value !== "" && !US_STATE_CODES.some(state => state === value);
  return E.pick(label, value, stateOptions, {
    ...controls,
    placeholder: "Choose a state",
    error: controls?.error ?? (invalid ? "Choose a US state from the list." : undefined),
  });
}

// lib/mgr/release-settings-view.ts — view-model for the Releases section of
// Settings (docs/plans/release-pool-and-ceilings.md): the brewery's release
// defaults as form text, the set_release_defaults payload with the reason it
// is withheld, and how one customer's ceiling reads.
import { submitReason } from "./submit-reason";
import { SHARE_FLOOR_PCT } from "./release-view";

/** The release columns of get_brewery. */
export type ReleaseSettings = {
  release_open_pct: number; release_order_by_days: number; release_cap_lift_days: number; release_digest_dow: number | null;
  release_share_window_days: number | null; release_stock_multiplier: number; release_max_share_pct: number;
};

/** The section's fields as typed text. digestDay "" sends no digest; shareWindowDays "" calculates no ceilings. */
export type ReleaseSettingsValues = {
  openPct: string; orderByDays: string; capLiftDays: string; digestDay: string;
  shareWindowDays: string; stockMultiplier: string; maxSharePct: string;
};

export const DIGEST_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function toReleaseSettingsValues(brewery: ReleaseSettings): ReleaseSettingsValues {
  return {
    openPct: String(brewery.release_open_pct), orderByDays: String(brewery.release_order_by_days), capLiftDays: String(brewery.release_cap_lift_days),
    digestDay: brewery.release_digest_dow == null ? "" : String(brewery.release_digest_dow),
    shareWindowDays: brewery.release_share_window_days == null ? "" : String(brewery.release_share_window_days),
    stockMultiplier: String(Number(brewery.release_stock_multiplier)), maxSharePct: String(brewery.release_max_share_pct),
  };
}

/** True when the text is a whole number from min to max. */
export const whole = (text: string, min: number, max: number) => /^\d+$/.test(text.trim()) && Number(text) >= min && Number(text) <= max;

/** set_release_defaults for the typed values; `reason` withholds Save until every field is in range and something changed. */
export function releaseDefaultsCommand(values: ReleaseSettingsValues, initial: ReleaseSettingsValues) {
  const multiplier = Number(values.stockMultiplier);
  const missing = [
    ...(whole(values.openPct, 1, 100) ? [] : ["a percent open from 1 to 100"]),
    ...(whole(values.orderByDays, 0, 60) ? [] : ["order-by days from 0 to 60"]),
    ...(whole(values.capLiftDays, 0, 90) ? [] : ["limit days from 0 to 90"]),
    ...(values.shareWindowDays.trim() === "" || whole(values.shareWindowDays, 7, 730) ? [] : ["a history window from 7 to 730 days, or blank"]),
    ...(/^\d+(\.\d{1,2})?$/.test(values.stockMultiplier.trim()) && multiplier >= 1 && multiplier <= 10 ? [] : ["a stock multiplier from 1 to 10"]),
    ...(whole(values.maxSharePct, 1, 100) ? [] : ["a maximum share from 1 to 100"]),
  ];
  const changed = (Object.keys(values) as (keyof ReleaseSettingsValues)[]).some((key) => values[key].trim() !== initial[key].trim());
  return {
    name: "set_release_defaults" as const,
    input: {
      openPct: Number(values.openPct), orderByDays: Number(values.orderByDays), capLiftDays: Number(values.capLiftDays),
      shareWindowDays: values.shareWindowDays.trim() === "" ? null : Number(values.shareWindowDays),
      stockMultiplier: multiplier, maxSharePct: Number(values.maxSharePct),
      digestDay: values.digestDay === "" ? null : Number(values.digestDay),
    },
    reason: submitReason(missing.length ? missing : changed ? [] : ["a change to the release settings"]),
  };
}

/** One list_release_shares row. */
export type ReleaseShareRow = { customer_id: string; customer_name: string; manual_pct: number | null; base_pct: number | null; pct: number | null };

const pct = (value: number) => `${Math.round(value * 10) / 10}%`;

/** How a customer's ceiling reads: "18% · 15% from purchases, +3% from stock", "5% · the minimum (0.9% of purchases)",
 *  "25% · set on the customer", or "No limit". A calculated ceiling under the
 *  customer's plain share was held to the maximum, or outweighed by others' stock purchases. */
export function releaseShareLine(row: Pick<ReleaseShareRow, "manual_pct" | "base_pct" | "pct">): string {
  if (row.pct == null) return "No limit";
  if (row.manual_pct != null) return `${pct(row.pct)} · set on the customer`;
  if (row.base_pct == null) return pct(row.pct);
  if (row.pct <= SHARE_FLOOR_PCT && row.base_pct < row.pct) return `${pct(row.pct)} · the minimum (${pct(row.base_pct)} of purchases)`;
  const fromStock = row.pct - row.base_pct;
  return fromStock >= 0.05 ? `${pct(row.pct)} · ${pct(row.base_pct)} from purchases, +${pct(fromStock)} from stock` : `${pct(row.pct)} · ${pct(row.base_pct)} of purchases before stock is weighed`;
}

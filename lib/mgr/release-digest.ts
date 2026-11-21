// lib/mgr/release-digest.ts — words the weekly release digest
// (docs/plans/release-pool-and-ceilings.md, stage 3). release_digest_rows gives
// one row per portal user, release and package; this groups them into one plain
// text email per user with three sections: new this week, limits lifting soon,
// and open to everyone. A user with nothing in any section gets no email.
import { formatDate, formatMonthDay } from "@/lib/date-format";
import { plural } from "./plural";
import { bbl, shiftDays } from "./release-view";

/** One release_digest_rows row (numbers already parsed). */
export type DigestRow = {
  /** digest_week is the Monday of the week, the key that keeps it to one digest a week; today is the brewery's date. */
  brewery_id: string; brewery_name: string; customer_id: string; user_id: string; digest_week: string; today: string; lift_days: number;
  brand: string; package: string; release_id: string; sku_id: string; ships_from: string; orders_close_on: string | null;
  new_this_week: boolean; badge: string; bbl_per_unit: number | null; limit_left_bbl: number | null; limit_lifts_on: string | null; suggested_qty: number | null;
};

/** One email to queue (queue_release_digest). */
export type Digest = { breweryId: string; customerId: string; userId: string; week: string; subject: string; text: string };

/** One beer on one ship date: the packages of a batch a customer can order. */
function beers(rows: DigestRow[]) {
  return [...Map.groupBy(rows, (row) => `${row.ships_from}|${row.brand}`).values()].map((batch) => {
    const [first] = batch;
    // The usual quantities, held to the buyer's limit on the batch as the Pre-order page holds them.
    let room = first.limit_left_bbl;
    const usual = batch.flatMap((row) => {
      if (!row.suggested_qty) return [];
      const qty = room == null || !row.bbl_per_unit ? row.suggested_qty : Math.min(row.suggested_qty, Math.floor(room / row.bbl_per_unit + 1e-9));
      if (room != null && row.bbl_per_unit) room -= qty * row.bbl_per_unit;
      return qty > 0 ? [`${qty} ${row.package}`] : [];
    });
    return {
      brand: first.brand, shipsFrom: first.ships_from,
      dates: `ships ${formatDate(first.ships_from)}${first.orders_close_on ? ` · order by ${formatDate(first.orders_close_on)}` : ""}`,
      packages: batch.filter((row) => row.badge !== "out").map((row) => row.package),
      isNew: batch.some((row) => row.new_this_week),
      limitLeft: first.limit_left_bbl, liftsOn: first.limit_lifts_on,
      // Past the day ceilings lift, what is left is open to everyone.
      lifted: shiftDays(first.ships_from, -first.lift_days) <= first.today,
      usual: usual.length ? `Your usual: ${usual.join(", ")}` : undefined,
    };
  }).filter((beer) => beer.packages.length);
}

/** The digests to queue: one per portal user who has something to read. `portalUrl` is the site's origin. */
export function buildReleaseDigests(rows: DigestRow[], portalUrl: string): Digest[] {
  return [...Map.groupBy(rows, (row) => `${row.customer_id}|${row.user_id}`).values()].flatMap((mine): Digest[] => {
    const [first] = mine;
    const all = beers(mine);
    const fresh = all.filter((beer) => beer.isNew);
    const lifting = all.filter((beer) => beer.liftsOn && beer.liftsOn <= shiftDays(first.today, 7));
    const open = all.filter((beer) => beer.lifted && !beer.isNew);
    if (!fresh.length && !lifting.length && !open.length) return [];
    const limit = (beer: (typeof all)[number]) => {
      if (beer.limitLeft == null || !beer.liftsOn) return undefined;
      const until = formatMonthDay(beer.liftsOn);
      if (beer.limitLeft > 0) return `You can order ${bbl(beer.limitLeft)} bbl more of this batch until ${until}.`;
      return `You have reached your limit on this batch until ${until}.`;
    };
    const section = (title: string, lines: string[]) => (lines.length ? [title, ...lines, ""] : []);
    const text = [
      `Pre-orders from ${first.brewery_name}`, "",
      ...section("NEW THIS WEEK", fresh.flatMap((beer) => [`${beer.brand} · ${beer.dates}`, `  ${beer.packages.join(", ")}`, ...[beer.usual, limit(beer)].filter((line) => line !== undefined).map((line) => `  ${line}`)])),
      ...section("LIMITS LIFTING SOON", lifting.map((beer) => `${beer.brand} · ${beer.dates}: the limit lifts ${formatMonthDay(beer.liftsOn!)}. ${limit(beer)}`)),
      ...section("OPEN TO EVERYONE", open.map((beer) => `${beer.brand} · ${beer.dates}`)),
      `Review and submit: ${portalUrl}/portal/pre-order?suggested=1`,
    ].join("\n");
    const subject = fresh.length ? `${first.brewery_name}: ${plural(fresh.length, "new beer")} to pre-order` : `${first.brewery_name}: pre-orders open this week`;
    return [{ breweryId: first.brewery_id, customerId: first.customer_id, userId: first.user_id, week: first.digest_week, subject, text }];
  });
}

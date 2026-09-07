# Pricing grid and naming standard (decided 2026-09-07)

Supersedes §16.4 of `2026-08-31-mgr-schema-design.md` (price lists, format
defaults, SKU overrides) and the `price_group` label added to brands in
Program 3. Reconciles with §16.3 (sale channels), which stands.

## The model

A brewery's price sheet today is one spreadsheet:

| tier | retail: glass, pack | resale: half, sixtel, case | wholesale: half, sixtel, case |
| --- | --- | --- | --- |
| 1 | $7, $14 | $189, $76, $65 | $132, $53, $46 |
| … | | | |
| 8 | $11, $29 | $500, $200, $135 | $350, $140, $95 |

Rows are **price tiers**, column groups are **sale channels**, columns are
**formats**. A beer sits on one tier; a customer sits on one channel. The
price of any SKU for any customer is one lookup:

```
price = channel_prices[ customer.sale_channel ][ brand.price_tier ][ sku.format ]
```

Nothing else prices anything. There is no per-customer list, no per-SKU
override ("the barrel-aged one" is a higher tier), no brewery default.

## Schema

```
price_tiers      id · brewery_id · name text · position int          unique (brewery_id, name), unique (brewery_id, position)
brands           price_tier_id uuid null → price_tiers (id, brewery_id)   (replaces price_group text)
sale_channels    unchanged (§16.3)
channel_prices   brewery_id · sale_channel_id · price_tier_id · format_id · unit_price_cents int >= 0
                 primary key (sale_channel_id, price_tier_id, format_id); composite FKs to all three; on delete restrict
customers        sale_channel_id uuid not null → sale_channels (id, brewery_id)   (replaces price_list_id)
orders           sale_channel_id uuid not null, copied from the customer at creation  (replaces price_list_id)
```

Dropped: `price_lists`, `price_list_formats`, `price_list_items`,
`customers.price_list_id`, `orders.price_list_id`, `brands.price_group`,
and the RPCs `upsert_price_list`, `set_price_list_format`, `set_price`,
`clear_price_list_item`.

`sku_prices` (security-invoker view) becomes `(brewery_id, sale_channel_id,
sku_id, sku_name, brand_name, active, unit_price_cents)`: one row per
channel × SKU whose brand has a tier and whose cell is filled. A SKU with no
tier or an empty cell is unpriced on that channel and cannot be ordered
there.

`private.order_line_price(p_brewery, p_channel, p_sku)` replaces the
price-list version. `create_order` copies the customer's channel onto the
order and prices lines from it; `adjust_order` and `confirm_order` reprice
from `orders.sale_channel_id`. `ship_order_impl` posts the removal to
`orders.sale_channel_id`; the lookup of a channel named Wholesale and the
rename/delete guard on that name go away.

Portal: a customer reads `channel_prices` rows for its own channel only
(policy on `sale_channel_id in (select sale_channel_id from customers where id in my_customer_ids())`).
`sale_channels` stays staff-only; the portal never needs the channel's name.

Order lines keep snapshotting `unit_price_cents` at creation; invoices
and credit memos are unchanged.

## Naming standard

One word per concept, everywhere: SQL, RPC parameters, command names and
inputs, page and form props, screen records, the guides.

| Concept | Name | Never |
| --- | --- | --- |
| Where a sale happens and its default tax | **sale channel** (`sale_channels`, `sale_channel_id`, `saleChannelId`) | channel alone in identifiers; "sales channel" |
| A row of the price grid a beer sits on | **price tier** (`price_tiers`, `price_tier_id`, `priceTierId`) | price group, price list, tier alone |
| The package or pour a price is quoted for | **format** (exists) | package, size |
| One cell of the grid | **channel price** (`channel_prices`, `set_channel_price`, `clear_channel_price`) | price list item, format price, override |
| What a customer pays | resolved through `sku_prices`; "price" in copy | "customer price list" |

Rules:

- A name containing "price" holds or resolves a price. A name that
  classifies a beer is named for the beer (`price_tier` is the exception
  by design: it is the row of the price grid, and the beer points at it).
- Screen names: **Prices** (the grid, one per channel), **Price tiers**
  (name and order the rows), **Sale channels** (exists). The old Price
  lists, Price tiers (as a list editor) and Override screens are retired.
- Nav label: **Prices** at `/pricing`. Rail group unchanged.
- Guides use "sale channel", "price tier", "format", "price". The word
  "list" does not appear in a pricing sentence.

## Decisions and their cost

- **Tier lives on the brand**, not the SKU. Every format of a beer follows
  one row. Cost if wrong: a brewery that wants its cans on a different
  tier than its kegs needs a second brand or a schema change to
  `skus.price_tier_id`.
- **No per-SKU override.** Cost if wrong: one-off pricing needs a new tier.
- **Two wholesale accounts at different prices are two channels.** Cost if
  wrong: channel-level sales reports split; add nothing until asked.
- **Customers require a channel.** Seeded and imported customers default
  to the brewery's Wholesale channel; taproom sales have no customer and
  post to the channel the movement names.
- **Formats are per brewery, so the grid's columns are whatever formats
  exist**; empty cells are simply unpriced.

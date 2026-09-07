# Pricing grid and naming standard (decided 2026-09-07)

Supersedes §16.4 of `2026-08-31-mgr-schema-design.md` (price lists, format
defaults, SKU overrides). Adopts from `2026-09-07-mgr-price-groups.md` (#189,
approved): the name **price group** and the retirement of "tier" (D8), the
group binding on the brand (D5), and the cost ceiling that suggests a group
(D7). Replaces #189's table shape (it kept `price_lists` and left the
customer assigned to a group while the brand also carried one): here the
customer has a sale channel, the brand has a price group, and the price is
the cell where they meet. #189's barcode per group × format (D3) is a
follow-on table, `price_group_barcodes (price_group_id, format_id, upc)`,
not part of Program 4b. §16.3 (sale channels) stands.

## The model

A brewery's price sheet today is one spreadsheet:

| group | retail: glass, pack | resale: half, sixtel, case | wholesale: half, sixtel, case |
| --- | --- | --- | --- |
| 1 | $7, $14 | $189, $76, $65 | $132, $53, $46 |
| … | | | |
| 8 | $11, $29 | $500, $200, $135 | $350, $140, $95 |

Rows are **price groups**, column groups are **sale channels**, columns are
**formats**. A beer sits on one group; a customer sits on one channel. The
price of any SKU for any customer is one lookup:

```
price = channel_prices[ customer.sale_channel ][ brand.price_group ][ sku.format ]
```

Nothing else prices anything. There is no per-customer list, no per-SKU
override ("the barrel-aged one" is a higher group), no brewery default.

## Schema

```
price_groups     id · brewery_id · name text · position int · cost_ceiling_cents int null   unique (brewery_id, name), unique (brewery_id, position)
brands           price_group_id uuid null → price_groups (id, brewery_id)   (replaces price_group text)
sale_channels    unchanged (§16.3)
channel_prices   brewery_id · sale_channel_id · price_group_id · format_id · unit_price_cents int >= 0
                 primary key (sale_channel_id, price_group_id, format_id); composite FKs to all three; on delete restrict
customers        sale_channel_id uuid not null → sale_channels (id, brewery_id)   (replaces price_list_id)
orders           sale_channel_id uuid not null, copied from the customer at creation  (replaces price_list_id)
```

Dropped: `price_lists`, `price_list_formats`, `price_list_items`,
`customers.price_list_id`, `orders.price_list_id`, `brands.price_group`,
and the RPCs `upsert_price_list`, `set_price_list_format`, `set_price`,
`clear_price_list_item`.

`sku_prices` (security-invoker view) becomes `(brewery_id, sale_channel_id,
sku_id, sku_name, brand_name, active, unit_price_cents)`: one row per
channel × SKU whose brand has a group and whose cell is filled. A SKU with no
group or an empty cell is unpriced on that channel and cannot be ordered
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
| A row of the price grid a beer sits on | **price group** (`price_groups`, `price_group_id`, `priceGroupId`) | price tier, price list, "tier" in any form (#189 D8), group alone |
| The package or pour a price is quoted for | **format** (exists) | package, size |
| One cell of the grid | **channel price** (`channel_prices`, `set_channel_price`, `clear_channel_price`) | price list item, format price, override |
| What a customer pays | resolved through `sku_prices`; "price" in copy | "customer price list" |

Rules:

- A name containing "price" holds or resolves a price. A name that
  classifies a beer is named for the beer (`price_group` is the exception
  by design: it is the row of the price grid, and the beer points at it).
- Screen names (as #189 already renamed them): **Price groups** is the
  grid, one table per sale channel; **Price group** is one row's name,
  position and cost ceiling; **Sale channels** exists. The Override screen
  is retired.
- Nav label: **Price groups** at `/pricing` (already so after #189).
- Guides use "sale channel", "price group", "format", "price". The word
  "list" does not appear in a pricing sentence.

## Decisions and their cost

- **Group lives on the brand**, not the SKU. Every format of a beer follows
  one row. Cost if wrong: a brewery that wants its cans on a different
  group than its kegs needs a second brand or a schema change to
  `skus.price_group_id`.
- **No per-SKU override.** Cost if wrong: one-off pricing needs a new group.
- **Two wholesale accounts at different prices are two channels.** Cost if
  wrong: channel-level sales reports split; add nothing until asked.
- **Customers require a channel.** Seeded and imported customers default
  to the brewery's Wholesale channel; taproom sales have no customer and
  post to the channel the movement names.
- **Formats are per brewery, so the grid's columns are whatever formats
  exist**; empty cells are simply unpriced.
- **Cost ceiling is a nullable number on the group** (#189 D7): it sorts
  and suggests, never assigns. Costing does not exist yet, so nothing reads
  it in Program 4b.
- **Barcode stays out of `channel_prices`.** A UPC does not vary by channel
  (#189 D3), so it cannot live in a channel cell; it gets its own
  group × format table later.

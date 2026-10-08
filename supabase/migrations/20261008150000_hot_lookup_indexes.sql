-- #757: indexes for lookups that were sequential scans.
--
-- my_brewery_ids() and my_customer_ids() find a user's memberships by user_id
-- inside every staff and portal RLS check; both primary keys lead with the
-- brewery or customer, so neither served that lookup. The second column is
-- what those functions return, so the lookup never reads the table.
create index if not exists brewery_users_user_idx on brewery_users (user_id, brewery_id);
create index if not exists customer_users_user_idx on customer_users (user_id, customer_id);

-- list_keg_events and get_keg_report read one brewery's keg ledger ordered by
-- at, created_at, id (newest first and oldest first respectively). This index
-- matches that order in both directions, so a page is a range scan, not a sort.
create index if not exists keg_events_at_idx on keg_events (brewery_id, at, created_at, id);

-- delete_bin probes each ledger for any row in the bin while it holds the bin
-- row lock. bin_id was only a trailing column of the on-hand indexes.
create index if not exists movements_bin_idx on inventory_movements (bin_id);
create index if not exists material_movements_bin_idx on material_movements (bin_id);
create index if not exists keg_events_bin_idx on keg_events (bin_id);

-- delete_customer removes the customer's ship-tos; each delete checks the
-- orders.ship_to_id foreign key, which had no index.
create index if not exists orders_ship_to_idx on orders (ship_to_id);

-- Redundant: price_groups_brewery_id_position_key is the same index, unique.
drop index if exists price_groups_brewery_idx;

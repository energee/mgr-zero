-- History paging (list_orders, list_invoices) reads one brewery newest first
-- by created_at, then id, and continues after a created_at~id cursor
-- (lib/commands/history.ts). These indexes match that order so a page is an
-- index range scan instead of a sort of the brewery's whole history.
create index orders_history_idx on orders (brewery_id, created_at desc, id desc);
create index invoices_history_idx on invoices (brewery_id, created_at desc, id desc);

-- Stock transfers have no draft step. Creating a transfer submits it, so
-- Record pick is the next action. submit_stock_transfer only flipped draft to
-- submitted: it validated, reserved and notified nothing, and no command
-- edited a draft. Creation now starts at 'submitted' through the column
-- default that create_stock_transfer's insert relies on.
--
-- The 'draft' value stays in stock_transfer_status, unused: removing an enum
-- value means rebuilding the type, which is not worth it.
-- cancel_stock_transfer still lists 'draft' among its allowed states; no
-- transfer can be in it.

alter table public.stock_transfers alter column status set default 'submitted';

update public.stock_transfers set status = 'submitted' where status = 'draft';

-- Dropping the function also drops its grants.
drop function public.submit_stock_transfer(uuid, uuid);

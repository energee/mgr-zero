-- All order create/update/adjust paths, including taproom-transfer orders and
-- portal quotes, share this boundary. Staff may order fractions; the portal's
-- separate assert_portal_order_lines guard still requires whole packaged units.
create or replace function private.assert_order_lines(p_lines jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare l jsonb; v_qty numeric;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'order requires at least one line';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'order requires at least one line';
  end if;
  for l in select value from jsonb_array_elements(p_lines) loop
    -- Check the JSON type before casting: numeric strings, null and missing
    -- quantities are not order quantities, even when PostgreSQL can cast them.
    if jsonb_typeof(l->'qty') is distinct from 'number' then
      raise exception 'order quantities must be positive finite numbers';
    end if;
    v_qty := (l->>'qty')::numeric;
    if v_qty::text in ('NaN','Infinity','-Infinity') or v_qty <= 0 then
      raise exception 'order quantities must be positive finite numbers';
    end if;
  end loop;
end $$;

-- Enforce new inserts/updates without rewriting or silently repairing any
-- previously corrupted orders. Existing positive checks do not reject NaN.
-- numeric(12,2) already excludes Infinity, but state the full finite invariant.
alter table public.order_lines add constraint order_lines_qty_ordered_finite
  check (qty_ordered::text not in ('NaN','Infinity','-Infinity')) not valid;
alter table public.allocations add constraint allocations_qty_finite
  check (qty::text not in ('NaN','Infinity','-Infinity')) not valid;

-- #1480: a completed batch's page shows the volume it packaged.
-- get_batch_completion_preview cannot supply it: its calculation raises
-- 'batch is already completed' once closed_at is set. This read returns
-- private.batch_volume_balance (baseline, packaged, attributed, residual), the
-- one place the packaged-volume rule lives, for any batch of the brewery.
create function public.get_batch_volume_balance(p_brewery uuid, p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_staff_read(p_brewery, array['admin','brewer']::public.staff_role[]);
  if not exists (select 1 from public.batches where id = p_batch and brewery_id = p_brewery) then
    raise exception 'batch not found';
  end if;
  return private.batch_volume_balance(p_brewery, p_batch);
end $$;

revoke all on function public.get_batch_volume_balance(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_batch_volume_balance(uuid, uuid) to authenticated;

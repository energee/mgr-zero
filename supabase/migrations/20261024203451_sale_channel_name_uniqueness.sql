-- Channel identity is brewery-scoped, trimmed like JavaScript, and case-insensitive.
-- Never choose a survivor or rewrite existing names: an operator must review any
-- legacy duplicate groups before this migration can be applied.
begin;

lock table public.sale_channels in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.sale_channels
    group by brewery_id, lower(private.js_btrim(name)) having count(*) > 1
  ) then
    raise exception 'Sale channels have duplicate names after trimming and ignoring case. Review the existing records before applying this migration.'
      using errcode = '23505',
        hint = 'Find affected records with: SELECT brewery_id, lower(private.js_btrim(name)) AS normalized_name, array_agg(id ORDER BY id) AS channel_ids FROM public.sale_channels GROUP BY brewery_id, lower(private.js_btrim(name)) HAVING count(*) > 1. No records have been renamed or deleted.';
  end if;
end $$;

-- Like the UUID column default, this pure expression must also run during
-- service-role seed/maintenance writes. It exposes no private data or mutation.
grant execute on function private.js_btrim(text) to service_role;

create unique index sale_channels_brewery_name_normalized_uidx
  on public.sale_channels (brewery_id, lower(private.js_btrim(name)));
alter table public.sale_channels drop constraint sale_channels_brewery_id_name_key;

create or replace function public.upsert_sale_channel(
  p_brewery uuid, p_id uuid, p_name text, p_tax_treatment public.tax_treatment, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb;
  v_row public.sale_channels;
  v_name text := private.js_btrim(p_name);
  v_constraint text;
  v_existing_name text;
begin
  perform private.assert_staff(p_brewery, array['admin']::public.staff_role[]);
  v_replay := private.claim_command_request(p_brewery, 'upsert_sale_channel', p_request_id,
    jsonb_build_object('brewery', p_brewery, 'id', p_id, 'name', p_name, 'tax_treatment', p_tax_treatment));
  if v_replay is not null then return v_replay; end if;
  if v_name is null or v_name = '' then raise exception 'Enter a channel name.'; end if;
  begin
    if p_id is null then
      insert into public.sale_channels (brewery_id, name, tax_treatment)
        values (p_brewery, v_name, p_tax_treatment) returning * into v_row;
    else
      select * into v_row from public.sale_channels where id = p_id and brewery_id = p_brewery;
      if not found then raise exception 'sale channel not found'; end if;
      update public.sale_channels set name = v_name, tax_treatment = p_tax_treatment
        where id = p_id and brewery_id = p_brewery returning * into v_row;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'sale_channels_brewery_name_normalized_uidx' then raise; end if;
    select private.js_btrim(name) into v_existing_name from public.sale_channels
      where brewery_id = p_brewery and lower(private.js_btrim(name)) = lower(v_name)
        and id is distinct from p_id;
    -- A concurrent delete may remove the winner after the index rejected us.
    raise exception 'A channel named % already exists.', coalesce(v_existing_name, v_name)
      using errcode = 'MGC01';
  end;
  return private.complete_command_request(p_request_id, to_jsonb(v_row));
end $$;

commit;

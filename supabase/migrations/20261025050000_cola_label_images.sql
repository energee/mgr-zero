-- Keep a copy of each saved COLA label image, so Catalog stops opening a TTB
-- session for every thumbnail on every view. TTB fails bursts of sessions and
-- is the only other copy. Bytes live here, not in Storage, because the test
-- and CI stacks run without storage-api; labels are 78 KB to 1.1 MB.
-- Keyed by TTB ID as well as the attachment URL: the URL names only a
-- filename, which TTB resolves inside that COLA's session.
create table public.cola_label_images (
  brewery_id uuid not null references public.breweries(id) on delete cascade,
  ttb_id text not null,
  image_url text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/gif','image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 8388608),
  stored_at timestamptz not null default now(),
  primary key (brewery_id, ttb_id, image_url)
);
-- ponytail: a replaced or removed label's copy stays (unserved) until the
-- brewery is deleted; prune when storage size matters.
-- Read through get_stored_cola_label_image; written only by the server.
alter table public.cola_label_images enable row level security;
revoke all on public.cola_label_images from public, anon, authenticated, service_role;

-- A copy is served only while the label is still saved on an approved COLA,
-- the rule get_saved_cola_image_permit applies before TTB is asked.
create function public.get_stored_cola_label_image(
  p_brewery uuid, p_ttb_id text, p_image_url text
) returns text language plpgsql stable security definer set search_path = '' as $$
declare v_data_url text;
begin
  perform private.assert_staff(p_brewery, enum_range(null::public.staff_role));
  select 'data:' || i.content_type || ';base64,' || replace(encode(i.bytes, 'base64'), E'\n', '') into v_data_url
    from public.cola_label_images i
    where i.brewery_id = p_brewery and i.ttb_id = p_ttb_id and i.image_url = p_image_url
      and exists (
        select 1 from public.brand_approvals a
        where a.brewery_id = i.brewery_id and a.kind = 'cola'
          and a.ttb_id = i.ttb_id and a.image_url = i.image_url
          and a.approved_on is not null
      );
  return v_data_url;
end $$;

-- Stores the label get_cola_image just fetched from TTB. Service-only: staff
-- could otherwise store forged bytes for a saved label before its first view,
-- and every later view would show them. lib/supabase/cola-label-images.ts calls
-- it after the command checked the caller and TTB checked the permit. An
-- unsaved preview is not kept (nothing is inserted), and the first copy wins:
-- a later call never replaces stored bytes.
create function public.store_cola_label_image(
  p_brewery uuid, p_ttb_id text, p_image_url text, p_data_url text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_type text := substring(p_data_url from '^data:(image/[a-z]+);base64,');
begin
  if v_type is null then raise exception 'Not a label image data URL.'; end if;
  insert into public.cola_label_images (brewery_id, ttb_id, image_url, content_type, bytes)
    select p_brewery, p_ttb_id, p_image_url, v_type, decode(substring(p_data_url from position(',' in p_data_url) + 1), 'base64')
    where exists (
      select 1 from public.brand_approvals a
      where a.brewery_id = p_brewery and a.kind = 'cola'
        and a.ttb_id = p_ttb_id and a.image_url = p_image_url
        and a.approved_on is not null
    )
    on conflict do nothing;
end $$;

revoke all on function public.get_stored_cola_label_image(uuid,text,text) from public, anon, authenticated;
grant execute on function public.get_stored_cola_label_image(uuid,text,text) to authenticated;
revoke all on function public.store_cola_label_image(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.store_cola_label_image(uuid,text,text,text) to service_role;

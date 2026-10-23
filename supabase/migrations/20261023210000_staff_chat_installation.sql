-- get_staff_chat_installation (#1208): what every staff member may know about
-- the brewery's Slack installation. My notification preferences shows the
-- brewery quiet hours a person falls back to, and shows the Slack link steps
-- only once the installation is active.
--
-- chat_installations stays admin-only (chat_installations_admin_read). This
-- security-definer read returns only the active flag and the quiet hours,
-- never credentials, workspace names or installer identity.
--
-- Returns {active, quietHours: {start, end, timezone} | null}. quietHours is
-- null when the brewery has none set. Its timezone follows
-- chat_fanout_deliveries: the installation's own quiet-hours zone, else the
-- brewery's. With no live installation it returns active false and null.

create function public.get_staff_chat_installation(p_brewery uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to ''
  as $function$
begin
  perform private.assert_staff_read(p_brewery, enum_range(null::public.staff_role));
  return coalesce((
    select jsonb_build_object('active', i.state = 'active', 'quietHours', case when i.quiet_hours_start is not null then
             jsonb_build_object('start', i.quiet_hours_start, 'end', i.quiet_hours_end, 'timezone', coalesce(i.quiet_hours_timezone, b.timezone)) end)
      from public.chat_installations i join public.breweries b on b.id = i.brewery_id
     where i.brewery_id = p_brewery and i.provider = 'slack' and i.state <> 'disconnected'),
    '{"active": false, "quietHours": null}'::jsonb);
end $function$;

revoke all on function public.get_staff_chat_installation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_staff_chat_installation(uuid) to authenticated;

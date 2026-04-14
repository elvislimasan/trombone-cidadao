begin;

with updated as (
  update public.user_preferences up
  set notification_preferences =
    jsonb_set(
      coalesce(nullif(up.notification_preferences::text, ''), '{}')::jsonb,
      '{moderation_required}',
      'true'::jsonb,
      true
    )
  from public.profiles p
  where p.id = up.user_id
    and p.is_admin is true
  returning up.user_id
)
select
  (select count(*) from updated) as updated_count,
  (select count(*) from public.profiles where is_admin is true) as admin_count,
  (select count(*) from public.user_preferences) as user_preferences_count;

commit;

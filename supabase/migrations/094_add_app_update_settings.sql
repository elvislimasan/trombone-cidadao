alter table public.site_config
add column if not exists app_update_settings jsonb;

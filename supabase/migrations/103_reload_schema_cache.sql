-- Force PostgREST to reload schema cache after report_updates table creation
notify pgrst, 'reload schema';

-- 157_rental_properties_street_number.sql
-- Adiciona número do imóvel, separado do texto livre de endereço, para
-- ajudar na localização (endereço vem do reverse-geocode do pin, sem número).

alter table public.rental_properties
  add column if not exists street_number text;

notify pgrst, 'reload schema';

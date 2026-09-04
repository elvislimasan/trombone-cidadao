-- Texto livre do botão que abre a fonte externa de um acontecimento.
-- Fonte, endereço e chamada têm funções diferentes e por isso ficam separados.

alter table public.city_events
  add column if not exists source_button_label text;

alter table public.city_events
  drop constraint if exists city_events_source_button_label_length;

alter table public.city_events
  add constraint city_events_source_button_label_length
  check (source_button_label is null or char_length(source_button_label) <= 80);

comment on column public.city_events.source_button_label is
  'Texto opcional do botão de link externo. Vazio usa o rótulo automático definido pelo cliente.';

notify pgrst, 'reload schema';

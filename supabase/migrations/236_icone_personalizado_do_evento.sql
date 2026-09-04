-- Um evento de agenda pode ser reuniao, feira, culto, show ou atividade.
-- A categoria continua sendo `event`; icon_key muda apenas sua apresentacao.

alter table public.city_events
  add column if not exists icon_key text;

alter table public.city_events
  drop constraint if exists city_events_icon_key_valido;

alter table public.city_events
  add constraint city_events_icon_key_valido check (
    icon_key is null or icon_key in (
      'calendar', 'meeting', 'celebration', 'music',
      'culture', 'sport', 'education', 'religious', 'fair'
    )
  );

comment on column public.city_events.icon_key is
  'Icone visual opcional para acontecimentos do tipo event.';

notify pgrst, 'reload schema';

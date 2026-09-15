-- Nome pelo qual o vereador é conhecido, sem substituir seu nome oficial.
alter table public.councilors
  add column if not exists nickname text;

comment on column public.councilors.nickname is
  'Apelido ou nome público opcional do vereador; o campo name continua sendo o nome oficial.';

notify pgrst, 'reload schema';

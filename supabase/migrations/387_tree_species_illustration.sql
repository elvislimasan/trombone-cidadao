begin;

alter table public.city_tree_species
  add column illustration_url text
  check (illustration_url is null or length(trim(illustration_url)) between 1 and 2000);

comment on column public.city_tree_species.illustration_url is
  'Imagem ilustrativa da espécie. Exibir com legenda e somente como alternativa à foto real de cada árvore.';

-- Usa o bucket tree-photos existente. As policies de espécie continuam
-- restringindo o INSERT à cidade autorizada; os arquivos ficam na pasta do usuário.

commit;

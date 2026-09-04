-- 226_pavement_street_slug.sql
--
-- A rua passa a ter um endereço legível.
--
-- O QUE ESTAVA ERRADO
--
-- `/mapa-pavimentacao/rua/623c79ff-48ce-44b2-96ca-cf679502ce7c`. O link é o que
-- as pessoas mandam no grupo do bairro e o que a Câmara cola num ofício — e um
-- uuid não diz de que rua se trata nem sobrevive a ser lido em voz alta. Pior:
-- ele some da barra de endereço no app nativo, então nem serve para conferir.
--
-- Agora: `/mapa-pavimentacao/rua/rua-pastor-domicio-afonso-dos-santos`.
--
-- POR QUE `translate` E NÃO `unaccent`
--
-- `unaccent` é uma extensão, e depender dela aqui significa que este arquivo
-- deixa de aplicar sozinho num projeto novo — que é exatamente o caso do DEV
-- recriado do zero. Os acentos do português são um conjunto pequeno e conhecido;
-- `translate` resolve sem dependência nenhuma.
--
-- POR QUE O SUFIXO NUMÉRICO, E NÃO O ID
--
-- Duas cidades podem ter "Rua do Comércio", e a rota não carrega a cidade. A
-- saída óbvia — colar um pedaço do uuid no fim — devolveria ao link justamente
-- a sujeira que se quis tirar. O sufixo `-2`, `-3` só aparece na segunda rua de
-- mesmo nome, então a esmagadora maioria dos endereços fica limpa.
--
-- O ID CONTINUA FUNCIONANDO
--
-- A página aceita os dois. Link antigo compartilhado no WhatsApp, QR impresso,
-- print de tela com a URL: nada disso quebra.

alter table public.pavement_streets
  add column if not exists slug text;

-- Minúsculas, sem acento, só letras/números/hífen, sem hífen duplo nem nas
-- pontas. Nome vazio devolve null — quem chama decide o que fazer.
create or replace function public.slug_de_rua(p_nome text)
returns text
language sql
immutable
as $fn$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(translate(
            coalesce(p_nome, ''),
            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
            'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
          )),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-{2,}', '-', 'g'
      ),
      '-'
    ),
    ''
  );
$fn$;

comment on function public.slug_de_rua(text) is
  'O nome da rua como pedaco de URL: minusculo, sem acento, hifens no lugar dos espacos.';

-- Garante unicidade acrescentando -2, -3... e nunca devolve o slug de OUTRA
-- linha. `p_id` existe para o update da propria rua nao colidir consigo mesma.
create or replace function public.slug_unico_de_rua(p_nome text, p_id uuid default null)
returns text
language plpgsql
stable
as $fn$
declare
  v_base text := public.slug_de_rua(p_nome);
  v_slug text;
  v_n    integer := 1;
begin
  -- Rua sem nome utilizavel (so pontuacao, ou vazio) fica sem slug e continua
  -- acessivel pelo id. Inventar 'rua-1' seria criar um endereco que nao diz
  -- nada e ainda por cima parece proposital.
  if v_base is null then return null; end if;

  v_slug := v_base;
  while exists (
    select 1 from public.pavement_streets
    where slug = v_slug and (p_id is null or id <> p_id)
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  return v_slug;
end;
$fn$;

create or replace function public.pavement_street_slug_sync()
returns trigger
language plpgsql
as $fn$
begin
  -- So recalcula quando o nome muda ou quando ainda nao ha slug. Sem essa
  -- guarda, todo update de status reescreveria o slug — e um link divulgado
  -- deixaria de funcionar porque alguem marcou a rua como pavimentada.
  --
  -- O teste de TG_OP nao e decorativo: em BEFORE INSERT o registro `old` nao
  -- existe, e ler `old.name` ali aborta o insert.
  if new.slug is null or (tg_op = 'UPDATE' and new.name is distinct from old.name) then
    new.slug := public.slug_unico_de_rua(new.name, new.id);
  end if;
  return new;
end;
$fn$;

drop trigger if exists pavement_street_slug on public.pavement_streets;
create trigger pavement_street_slug
before insert or update of name on public.pavement_streets
for each row execute function public.pavement_street_slug_sync();

-- Backfill. Uma rua por vez, e nao um update em bloco: `slug_unico_de_rua`
-- precisa enxergar os slugs ja gravados para o contador de desempate funcionar,
-- e num update unico todas as linhas veriam a tabela como estava antes.
do $$
declare
  r record;
begin
  -- Ordem estavel por nome e id: em duas ruas homonimas, quem fica com o slug
  -- limpo e quem fica com o `-2` nao pode depender da ordem que o Postgres
  -- resolver devolver.
  for r in select id, name from public.pavement_streets where slug is null order by name, id loop
    update public.pavement_streets
    set slug = public.slug_unico_de_rua(r.name, r.id)
    where id = r.id;
  end loop;
end $$;

create unique index if not exists pavement_streets_slug_idx
  on public.pavement_streets (slug)
  where slug is not null;

comment on column public.pavement_streets.slug is
  'O nome da rua na URL. Unico. O id continua valendo na rota — link antigo nao quebra.';

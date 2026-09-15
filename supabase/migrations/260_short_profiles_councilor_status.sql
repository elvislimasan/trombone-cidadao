-- URLs curtas de perfil exigem que nomes de rotas sejam reservados e o
-- status do mandato passa a fazer parte do cadastro legislativo.

update public.profiles
set public_bio = left(public_bio, 150)
where length(public_bio) > 150;

alter table public.profiles
  drop constraint if exists profiles_public_bio_length_check;

alter table public.profiles
  add constraint profiles_public_bio_length_check
  check (length(public_bio) <= 150);

create or replace function public.is_username_reserved(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(p_username)) in (
    'admin', 'administrator', 'suporte', 'support', 'trombone', 'trombonecidadao',
    'prefeitura', 'vereador', 'vereadores', 'mandato', 'oficial', 'governo', 'camara',
    'feed', 'mapa', 'bronca', 'broncas', 'obras', 'obras-publicas', 'estatisticas',
    'sobre', 'contato', 'noticia', 'noticias', 'servicos', 'perfil', 'login', 'cadastro',
    'entrar', 'sair', 'ajuda', 'termos', 'privacidade', 'patrulha', 'missoes',
    'agora', 'radar', 'pavimentacao', 'mapa-pavimentacao', 'abaixo-assinado',
    'abaixo-assinados', 'peticoes', 'favoritos', 'salvos-outros', 'obras-favoritas',
    'settings', 'configuracoes', 'explorar', 'seguindo', 'api', 'auth', 'share', 'u',
    'root', 'moderador', 'moderacao', 'sistema', 'ouvidoria', 'denuncia', 'relatorio',
    'buscar', 'app', 'convite', 'imoveis-alugados', 'meta', 'embaixador',
    'painel-usuario', 'alterar-senha', 'excluir-conta', 'minhas-peticoes'
  );
$$;

alter table public.councilors
  add column if not exists is_in_office boolean;

comment on column public.councilors.is_in_office is
  'True quando o vereador esta em exercicio, false quando nao esta e null quando nao informado.';

notify pgrst, 'reload schema';

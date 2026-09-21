-- A URL pública do Guia ocupa um segmento que antes poderia ser um username.
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
    'sobre', 'contato', 'noticia', 'noticias', 'servicos', 'guiadacidade', 'guia-da-cidade', 'perfil', 'login', 'cadastro',
    'entrar', 'sair', 'ajuda', 'termos', 'privacidade', 'patrulha', 'missoes',
    'agora', 'radar', 'pavimentacao', 'mapa-pavimentacao', 'abaixo-assinado',
    'abaixo-assinados', 'peticoes', 'favoritos', 'salvos-outros', 'obras-favoritas',
    'settings', 'configuracoes', 'explorar', 'seguindo', 'api', 'auth', 'share', 'u',
    'root', 'moderador', 'moderacao', 'sistema', 'ouvidoria', 'denuncia', 'relatorio',
    'buscar', 'app', 'convite', 'imoveis-alugados', 'meta', 'embaixador',
    'painel-usuario', 'alterar-senha', 'excluir-conta', 'minhas-peticoes'
  );
$$;

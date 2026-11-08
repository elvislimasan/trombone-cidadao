import { matchPath } from 'react-router-dom';

// Contrato de apresentação. As permissões continuam nos guards e no servidor.
const routes = [
  { paths: ['/', '/feed'], title: null, tab: '/', root: true },
  { paths: ['/explorar'], title: 'Explorar', tab: '/explorar', root: true },
  { paths: ['/mapa'], title: 'Mapa', tab: '/mapa', root: true },
  { paths: ['/perfil'], title: 'Perfil', tab: '/perfil', root: true },
  { paths: ['/buscar'], title: 'Buscar', tab: '/explorar' },
  { paths: ['/seguindo', '/favoritos'], title: 'Acompanhando', tab: '/perfil', fallbackTo: '/perfil' },
  { paths: ['/configuracoes', '/perfil/preferencias'], title: 'Configurações', tab: '/perfil', fallbackTo: '/perfil' },
  { paths: ['/settings/notifications'], title: 'Notificações', tab: '/perfil', fallbackTo: '/configuracoes' },
  { paths: ['/alterar-senha'], title: 'Alterar senha', tab: '/perfil', fallbackTo: '/configuracoes' },
  { paths: ['/excluir-conta'], title: 'Excluir conta', tab: '/perfil', fallbackTo: '/configuracoes' },
  { paths: ['/minhas-peticoes'], title: 'Meus abaixo-assinados', tab: '/perfil', fallbackTo: '/perfil' },
  { paths: ['/salvos-outros', '/obras-favoritas'], title: 'Itens salvos', tab: '/perfil', fallbackTo: '/seguindo' },
  { paths: ['/perfil/*', '/painel-usuario'], title: 'Meu perfil', tab: '/perfil', fallbackTo: '/perfil' },
  { paths: ['/login'], title: 'Entrar', fallbackTo: '/', auth: true },
  { paths: ['/cadastro'], title: 'Criar conta', fallbackTo: '/', auth: true },
  { paths: ['/recuperar-senha'], title: 'Recuperar senha', fallbackTo: '/', auth: true },
  { paths: ['/completar-cadastro'], title: 'Completar cadastro', fallbackTo: '/', auth: true },
  { paths: ['/bronca/:id'], title: 'Detalhes da bronca', tab: '/', fallbackTo: '/mapa', share: true },
  { paths: ['/broncas', '/broncas-legado'], title: 'Broncas', tab: '/mapa', fallbackTo: '/mapa' },
  { paths: ['/agora'], title: 'Radar da cidade' },
  { paths: ['/agora/:id', '/share/radar/:id'], title: 'Acontecimento', fallbackTo: '/agora' },
  { paths: ['/obras-publicas'], title: 'Obras públicas' },
  { paths: ['/obras-publicas/:id'], title: 'Detalhes da obra', fallbackTo: '/obras-publicas' },
  { paths: ['/noticias'], title: 'Notícias' },
  { paths: ['/noticias/:id'], title: 'Notícia', fallbackTo: '/noticias', share: true },
  { paths: ['/abaixo-assinados'], title: 'Abaixo-assinados' },
  { paths: ['/abaixo-assinado/:id', '/abaixo-assinado-moderno/:id'], title: 'Abaixo-assinado', fallbackTo: '/abaixo-assinados' },
  { paths: ['/mapa-arborizacao'], title: 'Arborização' },
  { paths: ['/arborizacao/arvore/:id'], title: 'Detalhes da árvore', fallbackTo: '/mapa-arborizacao' },
  { paths: ['/arborizacao/gerenciar', '/admin/arborizacao'], title: 'Gerenciar arborização', tab: '/perfil', fallbackTo: '/mapa-arborizacao' },
  { paths: ['/adoteumaarvore', '/adote-uma-arvore'], title: 'Adote uma árvore' },
  { paths: ['/arvores-da-comunidade'], title: 'Árvores da comunidade' },
  { paths: ['/arvores-da-comunidade/nova'], title: 'Cadastrar árvore', fallbackTo: '/arvores-da-comunidade' },
  { paths: ['/arvores-da-comunidade/:id/editar'], title: 'Editar árvore', fallbackTo: '/arvores-da-comunidade' },
  { paths: ['/arvores-da-comunidade/:id'], title: 'Árvore da comunidade', fallbackTo: '/arvores-da-comunidade' },
  { paths: ['/mapa-pavimentacao'], title: 'Ruas e pavimentação' },
  { paths: ['/mapa-pavimentacao/rua/:id', '/share/rua/:id'], title: 'Detalhes da rua', fallbackTo: '/mapa-pavimentacao' },
  { paths: ['/imoveis-alugados'], title: 'Imóveis públicos alugados' },
  { paths: ['/imoveis-alugados/:id'], title: 'Detalhes do imóvel', fallbackTo: '/imoveis-alugados' },
  { paths: ['/guia-da-cidade', '/share/guia'], title: 'Guia da cidade' },
  { paths: ['/guia-da-cidade/*', '/share/guia/*', '/guiadacidade/*', '/servicos/*'], title: 'Guia da cidade', fallbackTo: '/guia-da-cidade' },
  { paths: ['/vereadores/*', '/share/vereador/*'], title: 'Atuação legislativa' },
  { paths: ['/missoes'], title: 'Missões' },
  { paths: ['/rota-do-dia'], title: 'Rota do dia', fallbackTo: '/missoes' },
  { paths: ['/colecao'], title: 'Minha coleção', fallbackTo: '/missoes' },
  { paths: ['/minhas-patrulhas'], title: 'Minhas patrulhas', tab: '/perfil', fallbackTo: '/missoes' },
  { paths: ['/patrulhar', '/patrulhar/*', '/conferir', '/sensoriamento'], title: 'Participar', fallbackTo: '/missoes' },
  { paths: ['/estatisticas'], title: 'Estatísticas' },
  { paths: ['/sobre'], title: 'Sobre o projeto' },
  { paths: ['/contato'], title: 'Contato' },
  { paths: ['/termos-de-uso'], title: 'Privacidade e termos', fallbackTo: '/configuracoes' },
  { paths: ['/seja-embaixador'], title: 'Seja embaixador' },
  { paths: ['/embaixador', '/admin', '/admin/*'], title: 'Área de trabalho', tab: '/perfil', fallbackTo: '/perfil' },
  { paths: ['/prefeitura/*'], title: 'Prefeitura', tab: null, fallbackTo: '/prefeitura/visao-geral' },
  { paths: ['/u/:username', '/@:username', '/share/perfil/:username', '/:username'], title: 'Perfil público' },
];

export function getMobileRoute(pathname = '/') {
  const path = pathname.split(/[?#]/)[0] || '/';
  const route = routes.find(({ paths }) => paths.some(pattern => matchPath({ path: pattern, end: true }, path)));
  return {
    title: 'Trombone Cidadão',
    tab: '/explorar',
    root: false,
    fallbackTo: '/explorar',
    ...route,
  };
}

export function getMobileBackTarget(route, historyState) {
  // idx identifica o histórico do React Router. Um link direto pode ter
  // histórico externo no navegador, mas precisa voltar a um destino do app.
  if (!route.auth && Number.isInteger(historyState?.idx) && historyState.idx > 0) return -1;
  return route.fallbackTo;
}

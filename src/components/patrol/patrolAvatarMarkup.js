// A PORTA DO AVATAR PARA O APP.
//
// O desenho não mora aqui. Ele vive em `./avatar`, dividido em peças: a
// geometria e a paleta que todas dividem, depois cabeça, cabelo, torso,
// braços, pernas, calçado, mochila, acessórios e veículo — e, ao lado deles, o
// caminho de render 3D em camadas de imagem.
//
// POR QUE O APP ENTRA POR AQUI E OS TESTES NÃO
//
// Este arquivo importa `carregarRenders`, que usa `import.meta.glob` para
// varrer `src/assets/patrol/avatar/`. Esse glob é uma construção do Vite e não
// existe no node puro. Os testes do desenho importam `@/components/patrol/avatar`
// diretamente, e por isso continuam rodando fora do bundler.
//
// O efeito colateral do import é intencional: ele registra as imagens
// disponíveis antes de qualquer chamada a `patrolAvatarHtml`. Sem imagem
// nenhuma na pasta, o registro fica vazio e o desenho vetorial responde por
// tudo — que é exatamente o estado em que a migração começa.

import './avatar/carregarRenders';

export { patrolAvatarHtml, PATROL_AVATAR_FRAME } from './avatar';
export { precarregarRenders } from './avatar/renderizacoes';

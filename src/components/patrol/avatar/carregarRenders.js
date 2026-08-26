// A PONTE ENTRE OS ARQUIVOS DE IMAGEM E O REGISTRO.
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO
//
// `import.meta.glob` é uma construção do Vite: ela vira uma lista de imports
// em tempo de build e não existe no node puro. Os testes do desenho importam
// `@/components/patrol/avatar` direto e rodam fora do Vite — se o glob morasse
// lá, cada teste quebraria tentando importar um `.webp`.
//
// Então quem importa este arquivo é `patrolAvatarMarkup.js`, a porta pela qual
// o APP entra. Os testes entram pela outra porta e nunca o tocam.
//
// ADICIONAR UM RENDER É SÓ SOLTAR O ARQUIVO NA PASTA
//
// Nada aqui lista nomes. O glob varre os WebP publicados em
// `src/assets/patrol/avatar/**` e a chave
// sai do próprio caminho: `corpo/masculino-costas.webp` vira a chave
// `corpo/masculino-costas`, que é exatamente o que `renderizacoes.js` procura.
// Um arquivo com nome fora do padrão simplesmente não é encontrado, e a peça
// continua vetorial — nunca quebra, no máximo não aparece.
// PNG fica reservado a master de trabalho e nao entra no bundle nativo.
//
// Ver `src/assets/patrol/avatar/LEIA-ME.md` para o padrão de nomes e a
// especificação de canvas, âncora e material.

import { registrarRenders } from './renderizacoes';

const RAIZ = '/src/assets/patrol/avatar/';

// `as: 'url'` é a forma do Vite 4. Em produção devolve o caminho já com hash,
// que é o que faz o cache do WebView invalidar quando a arte muda.
const arquivos = import.meta.glob('/src/assets/patrol/avatar/**/*.webp', {
  eager: true,
  as: 'url',
});

const registro = new Map();

for (const [caminho, url] of Object.entries(arquivos)) {
  if (!caminho.startsWith(RAIZ)) continue;
  const chave = caminho.slice(RAIZ.length).replace(/\.webp$/, '');
  registro.set(chave, url);
}

registrarRenders(registro);

export const RENDERS_CARREGADOS = registro.size;

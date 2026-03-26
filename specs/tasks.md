# Tasks: Melhoria de Experiência Mobile e Navegação Nativa

Este documento descreve as tarefas técnicas necessárias para implementar a nova navegação móvel e melhorias de design.

## Fase 1: Componente de Cabeçalho Móvel
- [ ] Criar `src/components/MobileHeader.jsx`.
  - [ ] Implementar lógica para detectar páginas raiz vs. sub-páginas.
  - [ ] Implementar botão "Voltar" funcional com `navigate(-1)`.
  - [ ] Mostrar Logo e Nome do Site em páginas raiz.
  - [ ] Integrar com `NotificationContext` para o ícone de notificações.
  - [ ] Estilizar com `backdrop-filter: blur(12px)` e respeitar `--safe-area-top`.

## Fase 2: Atualização do `App.jsx`
- [ ] Renderizar `MobileHeader` em `App.jsx` quando `Capacitor.isNativePlatform()` for verdadeiro.
- [ ] Ajustar `paddingTop` dinâmico no container `main` para evitar sobreposição do `MobileHeader`.
- [ ] Garantir que o `MobileHeader` não seja exibido em telas de login/cadastro (opcional).

## Fase 3: Melhorias no `BottomNav.jsx`
- [ ] Adicionar suporte a `@capacitor/haptics` para vibração leve no toque.
- [ ] Adicionar item "Mais" para abrir o menu completo.
- [ ] Estilizar com `backdrop-filter: blur(12px)` e fundo semi-transparente.
- [ ] Refinar áreas de toque e feedback visual.

## Fase 4: Transições e Animações
- [ ] Implementar transições de página suaves com `framer-motion` nas rotas principais.
- [ ] Adicionar animações de entrada para listas de broncas e notícias.
- [ ] Adicionar feedback visual ao tocar em botões principais (ex: escala leve).

## Fase 5: Refinamento de Safe Areas e UI
- [ ] Revisar todas as páginas para garantir que o conteúdo não seja cortado por entalhes (notch) ou barras de sistema.
- [ ] Implementar Skeleton Screens em substituição a indicadores de carregamento simples em listas principais.
- [ ] Refinar estados vazios (empty states) com ilustrações ou ícones melhores.

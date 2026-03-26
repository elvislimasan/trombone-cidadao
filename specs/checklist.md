# Checklist: Melhoria de Experiência Mobile e Navegação Nativa

Este documento descreve as verificações finais para garantir que as melhorias de design e navegação móvel foram implementadas corretamente.

## 1. Navegação Superior (MobileHeader)
- [ ] O `MobileHeader` é exibido corretamente apenas em plataformas nativas (Android/iOS via Capacitor).
- [ ] O Logo e o Nome do Site são visíveis em páginas principais (Home, Stats, Favoritos, Perfil).
- [ ] O botão de notificações (ícone de sino) aparece e funciona no `MobileHeader`.
- [ ] O botão "Voltar" (ícone de seta) aparece apenas em sub-páginas (detalhes de broncas, notícias, etc.).
- [ ] O botão "Voltar" redireciona corretamente para a página anterior (`navigate(-1)`).
- [ ] O título da sub-página atual aparece corretamente no centro do `MobileHeader`.

## 2. Navegação Inferior (BottomNav)
- [ ] O `BottomNav` mantém seus itens principais (Home, Estatísticas, Adicionar, Favoritos, Perfil).
- [ ] Os itens do `BottomNav` agora possuem feedback tátil (vibração leve ao tocar) via `@capacitor/haptics`.
- [ ] O `BottomNav` utiliza `backdrop-filter: blur(12px)` para um efeito de transparência moderna.
- [ ] A área de toque dos botões do `BottomNav` é adequada (mínimo 44px).

## 3. UI/UX e Safe Areas
- [ ] O `MobileHeader` respeita perfeitamente o entalhe (notch) superior usando `env(safe-area-inset-top)`.
- [ ] O `BottomNav` respeita a barra de gestos inferior usando `env(safe-area-inset-bottom)`.
- [ ] O conteúdo principal do app (`main`) possui `padding` adequado tanto no topo quanto na base para evitar sobreposição.
- [ ] Transições de página entre rotas são suaves e não apresentam saltos de layout.
- [ ] Skeleton Screens são exibidos corretamente durante o carregamento de listas principais.

## 4. Estilo e Consistência
- [ ] O design é consistente com a paleta de cores definida em `menuConfig.js`.
- [ ] O contraste de texto e ícones sobre o fundo semi-transparente é legível.
- [ ] O app possui um visual de "alto nível" (premium) com efeitos de desfoque e animações fluidas.

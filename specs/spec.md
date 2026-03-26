# Spec: Melhoria da Experiência Mobile e Navegação Nativa

Este documento descreve as melhorias necessárias para transformar o app Trombone Cidadão em uma experiência de "alto nível" em dispositivos móveis (Android/iOS via Capacitor).

## 1. Análise do Estado Atual
Atualmente, ao esconder o `Header` em plataformas nativas, perdemos:
- **Branding**: Logo e nome do site somem do topo.
- **Menu Completo**: 7 das 9 seções principais ficam inacessíveis, pois o `BottomNav` só contém 5 links.
- **Acessibilidade de Perfil/Notificações**: O acesso rápido a notificações e perfil (incluindo painel admin) é perdido no topo.
- **Consistência de Navegação**: Sub-páginas implementam botões de voltar de forma variada e às vezes inconsistente.

## 2. Soluções Propostas

### A. Novo Componente `MobileHeader`
Um cabeçalho fixo no topo apenas para plataformas nativas que se adapta ao contexto:
- **Páginas Raiz** (Home, Estatísticas, Favoritos, Perfil):
  - Esquerda: Logo do app.
  - Centro: Nome do site ou vazio.
  - Direita: Ícone de Notificações e busca rápida.
- **Sub-páginas** (Detalhes de Bronca, Notícias, Obras, etc.):
  - Esquerda: Botão "Voltar" (ícone `ChevronLeft` ou `ArrowLeft`).
  - Centro: Título da página atual.
  - Direita: Ação contextual (ex: Compartilhar) ou vazio.

### B. Atualização do `BottomNav`
- **Capacitor Haptics**: Adicionar feedback tátil (vibração leve) ao tocar nos itens.
- **Menu "Mais"**: Adicionar um item "Mais" que abre uma gaveta (Drawer) ou menu full-screen com as seções que não cabem no BottomNav (Sobre, Serviços, Contato, etc.).
- **Estilo Glassmorphism**: Aplicar `backdrop-filter: blur(12px)` com fundo semi-transparente para um visual premium.

### C. UI/UX de Alto Nível
- **Transições de Página**: Implementar transições suaves entre rotas usando `framer-motion` (ex: deslizar lateralmente ou fade).
- **Safe Areas Robustas**: Garantir que o `MobileHeader` e o `BottomNav` respeitem perfeitamente o entalhe (notch) e a barra de gestos do sistema usando `--safe-area-top` e `--safe-area-bottom`.
- **Skeleton Screens**: Substituir textos de "Carregando..." por esqueletos de UI animados para melhor percepção de velocidade.
- **Feedback Visual**: Estados de `hover` e `active` mais refinados para toques em telas móveis.

## 3. Diretrizes de Design
- **Cores**: Manter a paleta do `menuSettings` (fundo escuro/claro conforme config).
- **Tipografia**: Usar pesos de fonte mais variados para hierarquia clara.
- **Espaçamento**: Aumentar áreas de toque para botões (mínimo 44x44px).

## 4. Impacto Técnico
- Nenhuma alteração disruptiva na versão Web.
- Uso de `@capacitor/haptics` para feedback tátil.
- Reutilização de lógica do `Header.jsx` e `NotificationContext.jsx`.

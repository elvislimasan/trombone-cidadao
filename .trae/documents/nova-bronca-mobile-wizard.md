# Plano: Melhorar “Nova Bronca” no Mobile Nativo (Wizard Premium)

## Resumo
Transformar o fluxo de criação de “Nova Bronca” no app nativo (Capacitor) em um **wizard por etapas**, com **mapa em tela cheia**, UI “cara de app”, e validação por etapa. A versão web mantém o layout atual.

## Estado Atual (Análise)
Arquivo principal: [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)

Hoje o modal:
- É um **form único** com scroll interno (`max-h-[90vh] overflow-y-auto`) e seções longas (título/categoria/descrição/mapa/mídia/lista de arquivos).
- Faz validação “tudo de uma vez” no submit e tenta `scrollIntoView` no primeiro campo com erro via `data-error-field`.
- No nativo, já tem UX própria para mídia (camera nativa + gallery + `VideoProcessorComponent`) e abre câmera em overlay.

Problemas típicos no mobile nativo:
- Muito scroll e “sensação web”.
- Mapa concorre com o resto do conteúdo e “puxa” o usuário para baixo.
- Validação/erros ficam menos claros quando o usuário ainda não chegou na seção.

## Objetivo (confirmado)
- Formato: **Wizard (uma etapa por vez)**.
- Localização: **Mapa em tela cheia**.
- Mídia: **Obrigatória para finalizar**.
- Visual: **premium / cara de app**.

## Proposta (Mudanças Planejadas)

### 1) Converter o nativo em Wizard por Etapas (somente quando `Capacitor.isNativePlatform()`)
**Arquivo:** [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)

**Como:**
- Introduzir estado `step` (ex.: `0..3`) e constantes de steps:
  1. **Info**: Título + Categoria (+ Poste se iluminação) + Descrição (opcional)
  2. **Local**: Mapa em destaque (altura grande/“quase tela cheia”) + endereço
  3. **Mídia**: Botões Tirar Foto / Galeria + vídeo (VideoProcessorComponent) + lista de arquivos
  4. **Revisão**: Resumo dos dados + ação “Cadastrar”
- Manter `formData` e handlers existentes (upload, câmera, vídeos etc.), mas **renderizar por step**.

**UI/UX premium:**
- Header fixo dentro do modal com:
  - “Nova Bronca”
  - indicador de progresso (barra / “Etapa 2 de 4”)
  - botão fechar `X` (cancelar)
- Footer fixo (sticky) com:
  - `Voltar` / `Continuar` / `Cadastrar`
  - Estado de loading (quando `isSubmitting`)
- Ajustes de Safe Area no nativo:
  - aplicar `paddingTop: env(safe-area-inset-top)` no container do modal
  - aplicar `paddingBottom: env(safe-area-inset-bottom)` no footer

**Comportamento:**
- `Continuar` valida apenas campos da etapa atual e navega para a próxima.
- `Cadastrar` só aparece na revisão e chama `handleSubmit`.
- `Cancelar` no header chama `handleClose` (mantendo a lógica já existente de abortar upload/limpar previews).

### 2) Validação por Etapa (sem scroll-to-hidden)
**Arquivo:** [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)

**Como:**
- Extrair uma função `validateStep(step)` que:
  - monta `newErrors` apenas para os campos daquela etapa
  - chama `setErrors(newErrors)`
  - retorna `true/false`
- No fluxo do wizard:
  - `Voltar` nunca valida
  - `Continuar` chama `validateStep(step)`
  - Na revisão, `Cadastrar` chama `handleSubmit` (validação completa ainda garante integridade)

**Regras por etapa:**
- Step Info: `title`, `category`, e `pole_number` se `iluminacao`.
- Step Local: `location` e `address`.
- Step Mídia: `(photos.length + videos.length) > 0`.
- Step Revisão: sem validação local, delega ao submit.

### 3) Localização “Mapa em Tela Cheia”
**Arquivo:** [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)

**Como:**
- No step de Local:
  - renderizar `LocationPickerMap` com altura maior (ex.: `h-[60vh]` ou “calc(100vh - header - footer - paddings)”).
  - manter o campo de endereço abaixo do mapa.
  - manter estados atuais para “câmera em uso” (quando `isTakingPhoto`).

### 4) Mídia como etapa dedicada + resumo consistente
**Arquivo:** [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)

**Como:**
- Mover toda a seção de mídia para um step único:
  - Botões (Tirar Foto / Galeria) com layout “app card”
  - `VideoProcessorComponent` mantido
  - Lista de arquivos adicionados mantém preview e remoção
- Na revisão:
  - Mostrar contadores (ex.: “2 fotos, 1 vídeo”)
  - Mostrar chips com categoria e endereço
  - Botão “Editar” por seção (leva para step correspondente) (opcional; se implementado, sem criar arquivos novos)

### 5) Manter o layout atual no Web (sem regressões)
**Arquivo:** [ReportModal.jsx](file:///c:/Users/lairt/Downloads/horizons-export-eff1a4c5-4884-43cf-92e9-e90f584b8f04/src/components/ReportModal.jsx)

**Como:**
- Branch de render:
  - `if (Capacitor.isNativePlatform())` → wizard
  - `else` → layout atual (form completo como hoje)

## Decisões e Premissas
- Não criar novos arquivos de UI para stepper; implementar no próprio `ReportModal.jsx` para reduzir impacto e manter estilo do projeto.
- Reutilizar `handleSubmit`, `handleClose` e lógica de upload existentes.
- Mídia continua obrigatória no nativo (e permanece igual no web, a menos que você peça mudança).

## Riscos / Pontos de Atenção
- Câmera overlay (`showCamera`) durante o wizard: garantir que o step atual não “perca estado” ao abrir/fechar câmera.
- Mapa e performance: manter `lazy`/`Suspense` do `LocationPickerMap`, e só renderizar o mapa quando o step for “Local”.
- Z-index e overlays: manter o modal acima do BottomNav e garantir que o step de mapa não “fure” o overlay.

## Verificação (Aceitação)
1. No app nativo:
   - Abrir “Nova Bronca” e navegar pelas 4 etapas sem scroll excessivo.
   - Step Local mostra mapa grande e o marcador funciona.
   - Não permite avançar sem preencher campos obrigatórios da etapa.
   - Não permite finalizar sem ao menos 1 foto/vídeo.
   - Botões Voltar/Continuar/Cadastrar funcionam e respeitam safe area.
2. No web:
   - Modal continua igual (layout atual), sem mudanças de comportamento.
3. Build:
   - `npm run build` passa.

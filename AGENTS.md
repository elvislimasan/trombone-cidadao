# Regras de layout do projeto

- Em páginas desktop com conteúdo distribuído (listas, dashboards, guias e grades), o contêiner externo deve ocupar a largura disponível. Use `.page-shell-fluid` ou gutters laterais equivalentes; não aplique `max-w-7xl`, `container` ou outro limite estreito ao contêiner da página inteira.
- A partir de 1200 px, mantenha cada margem externa em no máximo 64 px. O conteúdo deve crescer com a viewport sem criar rolagem horizontal.
- Se uma parte precisar de largura confortável para leitura ou formulário, limite somente essa coluna interna — nunca o layout inteiro. Redistribua o espaço extra entre colunas, cards ou painéis.
- Ao mudar layout desktop, confira pelo menos 1440 px e 1920 px de largura. Exceções (por exemplo, artigo de leitura) devem ser intencionais e documentadas no componente.

## Preferência do cliente: textos na interface

- Confirmada em 06/11/2026: priorizar layouts diretos, com títulos curtos, campos e ações. Não acrescentar subtítulos ou parágrafos descritivos por padrão em páginas, cartões e etapas de formulário.
- Apresentar explicações adicionais em ajuda opcional ou no momento em que forem necessárias, sem ocupar permanentemente o layout.
- Preservar mensagens de erro, validação e estado, além de informações essenciais sobre a visibilidade dos dados e o efeito de uma ação, junto ao controle correspondente.
- Aplicar essa preferência nas próximas evoluções e revisões de telas do projeto.

## Mapas interativos

- Ao criar um mapa interativo, incluir controles de localização atual e alternância entre mapa padrão e satélite. Reutilizar `MapDisplayControls` e `MapBaseLayer` quando o mapa usar Leaflet.
- A localização atual deve depender da permissão do dispositivo e mostrar uma mensagem clara quando indisponível. Em formulários, usar a posição obtida para preencher o ponto selecionado somente após a ação explícita do usuário.

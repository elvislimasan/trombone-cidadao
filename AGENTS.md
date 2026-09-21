# Regras de layout do projeto

- Em páginas desktop com conteúdo distribuído (listas, dashboards, guias e grades), o contêiner externo deve ocupar a largura disponível. Use `.page-shell-fluid` ou gutters laterais equivalentes; não aplique `max-w-7xl`, `container` ou outro limite estreito ao contêiner da página inteira.
- A partir de 1200 px, mantenha cada margem externa em no máximo 64 px. O conteúdo deve crescer com a viewport sem criar rolagem horizontal.
- Se uma parte precisar de largura confortável para leitura ou formulário, limite somente essa coluna interna — nunca o layout inteiro. Redistribua o espaço extra entre colunas, cards ou painéis.
- Ao mudar layout desktop, confira pelo menos 1440 px e 1920 px de largura. Exceções (por exemplo, artigo de leitura) devem ser intencionais e documentadas no componente.

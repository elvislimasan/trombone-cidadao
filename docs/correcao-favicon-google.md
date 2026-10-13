# Favicon do Trombone nos resultados do Google

Em 9 de outubro de 2026, a verificação HTTP do site publicado encontrou `favicon.ico`, `favicon-16x16.png`, `apple-touch-icon.png` e `android-chrome-192x192.png` com status 200 e tipos MIME de imagem, mas conteúdo textual `<![CDATA[...Base64...]]>`. Esses arquivos não eram imagens binárias válidas. O ícone de 512 × 512 referenciado no manifest também estava ausente do projeto.

A correção gera PNGs binários reais a partir de `assets/icon-only.png`, restaura um ICO com cinco resoluções, fornece os dois ícones do manifest e declara `/favicon-96x96.png` diretamente no `head` estático da home. As referências duplicadas no HTML e no React Helmet foram removidas. A logo mantém o fundo marrom usado nos ícones das lojas.

Os favicons PNG e as cinco imagens do ICO usam uma máscara circular com transparência fora do círculo marrom. Os arquivos continuam quadrados nas dimensões declaradas; a transparência cria a aparência redonda. Os ícones de instalação PWA, Apple Touch e das lojas mantêm seu formato próprio.

Para regenerar apenas os favicons:

```bash
npm run assets:favicons
```

Depois de publicar o build do site:

1. Limpe o cache da hospedagem/CDN para a home e os arquivos de ícone substituídos.
2. Confirme que `https://trombonecidadao.com.br/favicon-96x96.png` abre como imagem, sem login, e que a home contém sua referência no HTML inicial.
3. No Google Search Console, inspecione `https://trombonecidadao.com.br/` e solicite indexação da home.

O Google precisa rastrear novamente a home e o ícone. O processamento pode levar dias ou semanas, e a exibição do favicon não é garantida, conforme a [documentação oficial](https://developers.google.com/search/docs/appearance/favicon-in-search). O `robots.txt` do projeto permite o rastreamento da home e das imagens.

Esta alteração corrige o projeto; não publica o site nem solicita indexação automaticamente.

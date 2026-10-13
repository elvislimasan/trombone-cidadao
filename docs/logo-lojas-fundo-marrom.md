# Logo do Trombone Cidadão com fundo marrom

Os ícones foram atualizados no projeto. Esta alteração ainda não foi publicada nas lojas.

## Arquivos

- `assets/icon-only.png`: matriz quadrada de 1024 × 1024 com a logo sobre fundo marrom.
- `assets/stores/google-play-512.png`: PNG RGBA de 512 × 512 para enviar ao Google Play Console.
- `assets/stores/app-store-1024.png`: PNG RGB de 1024 × 1024, sem canal alfa, para o iOS.
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`: ícone usado pelo catálogo do Xcode.
- `android/app/src/main/res/mipmap-*/ic_launcher*.png`: ícones Android nas seis densidades existentes. A camada de primeiro plano original permanece em uso nos ícones adaptáveis.
- `assets/icon-background.svg`: fundo sólido `#4a2121` dos ícones adaptáveis Android, sem inset no fundo.

Para regenerar os arquivos sem alterar as telas de abertura:

```bash
npm run assets:icons
```

Execute esse comando novamente se usar o gerador genérico `capacitor-assets`, que pode restaurar fundos brancos e o inset do fundo. A logo transparente `assets/logo.png` continua disponível para as telas de abertura.

## Publicação

No Google Play Console, substitua o ícone da ficha da loja pelo arquivo `assets/stores/google-play-512.png` e envie a alteração para publicação. Os ícones instalados nos aparelhos são atualizados ao publicar um novo AAB com os recursos Android deste projeto.

No iOS, compile e envie uma nova versão do app com o catálogo de ícones atualizado e submeta-a à revisão. A troca do ícone de um app já publicado exige uma nova versão, conforme a [documentação da Apple](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon/).

Requisitos do arquivo Google Play: [especificação oficial de ícones](https://developer.android.com/distribute/google-play/resources/icon-design-specifications).

## Origem da imagem

Edição realizada com a ferramenta integrada imagegen, usando o ícone original do catálogo iOS como alvo. Prompt utilizado:

> Use case: precise-object-edit. Edit target: existing Trombone Cidadão app icon. Change ONLY the white background to a completely uniform solid dark brown, exact hex #4a2121 (RGB 74,33,33), extending all the way to every edge of the square. Preserve the existing red, yellow, and black megaphone logo exactly, its silhouette, angle, shape, position, scale, proportions, flat fills, internal black oval and yellow ellipse, and all existing spacing. Do not redesign or reinterpret the megaphone. No text, no new elements, no shadows, no gradients, no texture, no border, no rounded corners. Output a square 1024x1024 opaque store icon. Entire background must be #4a2121.

A imagem gerada foi convertida para os tamanhos e canais de cor das plataformas. O fundo marrom da imagem gerada apresenta pequenas variações de cor; o fundo adaptável Android usa o valor sólido `#4a2121`.

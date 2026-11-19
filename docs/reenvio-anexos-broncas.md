# Broncas com anexos pendentes

O registro da bronca independe dos arquivos. Fotos e vídeos falham individualmente; uma falha não apaga a bronca nem cancela outros anexos. A galeria recebe apenas arquivos confirmados pelo Storage.

O botão **Imagens das broncas**, a confirmação de envio e a página da bronca abrem as ações **Reenviar**, **Trocar imagem** e **Adicionar fotos**. Interromper ou remover uma pendência preserva o relato e os arquivos já enviados.

A fila guarda Blobs e caminhos nativos em IndexedDB. Após recarregar, o usuário decide quando reenviar. Se o aparelho negar armazenamento, a interface informa que a recuperação fica disponível somente na sessão aberta. Se um arquivo nativo tiver sido removido do cache, o usuário pode substituí-lo.

Autores adicionam arquivos às próprias broncas. Administradores e masters adicionam fotos; embaixadores ativos adicionam fotos a broncas públicas de suas cidades. O endpoint valida a conta e a cidade em cada preparação e confirmação. A autoria do relato permanece a mesma.

Sem conta, uma autorização HMAC limitada aos anexos daquela bronca permite recuperação neste aparelho por sete dias. ID e protocolo não autorizam alterações. O segredo e a chave de serviço permanecem no servidor.

## Implantação

Antes de publicar o frontend/app, implantar as duas funções:

```sh
npm run deploy:functions:report-media
```

Não há migração de banco. `create-anonymous-report` mantém a resposta antiga para apps já publicados; clientes novos enviam `deferMedia: true` e usam `report-media` separadamente. As funções exigem as variáveis Supabase já usadas no projeto.

O servidor usa identificadores estáveis e consulta arquivos e referências existentes antes de assinar novo envio. Repetir a confirmação não duplica a imagem e uma resposta perdida após o PUT não exige enviar os bytes novamente.

## Validação

Os testes cobrem falhas parciais, reenvio, substituição, restauração, indisponibilidade de armazenamento, autorização anônima expirada ou adulterada, permissões de autor/moderador/cidade, arquivos ausentes, confirmação repetida, Safari e eventos nativos recebidos antes do retorno do plugin.

No iPhone físico, conferir fotos JPEG/HEIC da galeria e da câmera, interrupção da conexão, reabertura do app e substituição de arquivos removidos do cache.

# Configuração do Login com Google

Para que o Login com Google funcione corretamente na plataforma Trombone Cidadão, é necessário realizar as configurações no **Google Cloud Console** e no **Supabase Dashboard**.

## 1. Configuração no Google Cloud Console

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2.  Crie um novo projeto ou selecione um existente.
3.  Vá para **APIs e Serviços** > **Tela de permissão OAuth**.
    *   Selecione **Externo** (External) e clique em Criar.
    *   Preencha as informações obrigatórias do aplicativo (Nome, Email de suporte, etc.).
    *   Prossiga até finalizar.
4.  Vá para **APIs e Serviços** > **Credenciais**.
5.  Clique em **+ CRIAR CREDENCIAIS** > **ID do cliente OAuth**.
    *   **Tipo de aplicativo**: Aplicação Web.
    *   **Nome**: Trombone Cidadão (ou sua preferência).
    *   **Origens JavaScript autorizadas**: Adicione a URL do seu projeto Supabase e a URL da sua aplicação (ex: `http://localhost:5173` para desenvolvimento e a URL de produção).
        *   *Dica*: Você pode encontrar a URL do seu projeto Supabase no Dashboard em Settings > API.
    *   **URIs de redirecionamento autorizados**: Adicione a URL de callback do Supabase:
        *   Formato: `https://<PROJECT_ID>.supabase.co/auth/v1/callback`
        *   Você encontra essa URL exata no Supabase Dashboard em Authentication > Providers > Google.
6.  Clique em **Criar**.
7.  Copie o **ID do cliente** e a **Chave secreta do cliente**.

## 2. Configuração no Supabase Dashboard

1.  Acesse seu projeto no [Supabase Dashboard](https://supabase.com/dashboard).
2.  Vá para **Authentication** > **Providers**.
3.  Selecione **Google** na lista.
4.  Ative a opção **Enable Google provider**.
5.  Cole o **Client ID** e o **Client Secret** obtidos no passo anterior.
6.  Clique em **Save**.

## 3. Configuração de Redirecionamento (URL Configuration)

1.  No Supabase Dashboard, vá para **Authentication** > **URL Configuration**.
2.  Em **Site URL**, certifique-se de que a URL principal da sua aplicação está configurada (ex: `http://localhost:5173` ou `https://sua-app.com`).
3.  Em **Redirect URLs**, adicione todas as URLs para onde o usuário pode ser redirecionado após o login (ex: `http://localhost:5173/**`, `https://sua-app.com/**`).
    *   Recomendado adicionar `http://localhost:5173/painel-usuario` explicitamente se necessário.

## 4. Testando

Após realizar essas configurações:
1.  Reinicie sua aplicação local se necessário.
2.  Acesse a página de Login.
3.  Clique no botão "Google".
4.  Você deve ser redirecionado para a tela de consentimento do Google e, após aceitar, retornar logado para o Painel do Usuário.

---

**Nota Importante**: Em produção, certifique-se de adicionar a URL do seu domínio final tanto no Google Cloud Console quanto nas configurações de URL do Supabase.

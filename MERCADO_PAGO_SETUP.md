# Guia de Configuração: Pix via Mercado Pago

Este documento detalha o passo a passo para configurar sua aplicação no Mercado Pago e habilitar a geração de QR Codes Pix no Trombone Cidadão.

## 1. Acessar o Painel de Desenvolvedor
1. Acesse o site [Mercado Pago Developers](https://www.mercadopago.com.br/developers).
2. Faça login com sua conta do Mercado Pago.
3. Clique em **"Suas integrações"** no menu superior ou acesse o [Painel de Aplicações](https://www.mercadopago.com.br/developers/panel).

## 2. Criar uma Nova Aplicação
Se você ainda não tem uma aplicação criada para o projeto:
1. Clique no botão **"Criar aplicação"**.
2. Escolha um nome para a aplicação (ex: `Trombone Cidadão`).
3. Em "Qual tipo de solução você quer integrar?", selecione **"Pagamentos Online"**.
4. Você será perguntado se está usando uma plataforma de e-commerce. Selecione **"Não"**.
5. Em "Qual produto você está integrando?", selecione **"Checkout Transparente"**.
   * *Nota: O Pix via API faz parte do Checkout Transparente/API de Pagamentos.*
6. Preencha os dados restantes e crie a aplicação.

## 3. Obter as Credenciais (Access Token)
Dentro da página da sua aplicação, você verá duas seções de credenciais no menu lateral esquerdo:

### A. Credenciais de Teste (Sandbox)
Use estas credenciais para desenvolver e testar sem gastar dinheiro real.
1. Clique em **"Credenciais de teste"**.
2. Copie o **"Access Token"** (começa com `APP_USR-...` ou `TEST-...`).
   * *Este é o token que você deve usar enquanto estiver testando.*

### B. Credenciais de Produção
Use estas credenciais quando for lançar o site para o público real.
1. Clique em **"Credenciais de produção"**.
2. Você precisará ativar as credenciais preenchendo formulários sobre o negócio (site, setor, etc.).
3. Após ativado, copie o **"Access Token"** de produção.

## 4. Configurar no Projeto (Supabase)
O sistema utiliza o `Access Token` para se comunicar com o Mercado Pago. Como é uma informação sensível, ela fica salva no Backend (Supabase).

### Para Testes (Agora)
1. Pegue o **Access Token de Teste**.
2. Abra o terminal do seu projeto.
3. Execute o comando:
   ```bash
   npx supabase secrets set MERCADO_PAGO_ACCESS_TOKEN=SEU_ACCESS_TOKEN_AQUI
   ```
   *(Substitua `SEU_ACCESS_TOKEN_AQUI` pelo token copiado)*.

### Para Produção (Futuro)
Quando for lançar:
1. Pegue o **Access Token de Produção**.
2. Rode o mesmo comando acima com o novo token.

## 5. Detalhes Importantes sobre o Pix
* **Chave Pix:** Ao usar a API do Mercado Pago, você **não precisa** informar sua chave Pix (CPF/Email) no código. O dinheiro vai automaticamente para a conta do Mercado Pago dona da aplicação.
* **Email do Pagador:** O Mercado Pago exige um email para criar o pagamento. O sistema usa o email do usuário logado ou `guest@horizons.com.br` para doações anônimas.
* **Validade:** O QR Code gerado tem validade padrão (geralmente 24h).

## 6. Testando o Pagamento
1. No seu site, escolha a opção "Pix (Mercado Pago)".
2. O QR Code será gerado.
3. **Não tente pagar o seu próprio QR Code com a mesma conta do Mercado Pago** que criou a aplicação. O Mercado Pago bloqueia transações de "mim para mim mesmo".
4. Use uma conta diferente ou o app do banco de outra pessoa para testar (no modo Produção) ou use as ferramentas de teste do Mercado Pago.

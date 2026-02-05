# Configuração de Webhook do Mercado Pago

Este documento guia a configuração de Webhooks para confirmação automática de pagamentos Pix no Mercado Pago.

## Pré-requisitos
- Conta no Mercado Pago Developers.
- Projeto Supabase com a Edge Function `create-payment-intent` deployada.
- URL da função: `https://[SEU_PROJETO].supabase.co/functions/v1/create-payment-intent`

## Passo a Passo

1. **Acesse o Painel do Mercado Pago:**
   - Vá para [Suas Integrações](https://www.mercadopago.com.br/developers/panel/app).
   - Selecione a aplicação que você está usando (onde pegou o `ACCESS_TOKEN`).

2. **Configure o Webhook:**
   - No menu lateral, clique em **Notificações** > **Webhooks**.
   - **Modo de Produção:** Certifique-se de configurar na aba correta (Produção vs Teste/Sandbox).
   - **URL de Produção:** Insira a URL da sua Edge Function.
     ```
     https://[SEU_PROJETO].supabase.co/functions/v1/create-payment-intent
     ```
   - **Eventos:** Selecione apenas **Pagamentos** (`payment`).

3. **Teste a Configuração:**
   - O Mercado Pago pode enviar um teste para validar a URL. A função está preparada para responder com status 200/201.

## Como Funciona

Quando um pagamento Pix é realizado:
1. O Mercado Pago envia um POST para a URL configurada com um JSON contendo `type: "payment"` e `data.id`.
2. A função `create-payment-intent` detecta que é um webhook.
3. A função consulta a API do Mercado Pago usando o `payment_id` para verificar se o status é `approved`.
4. Se aprovado, a função cria o registro na tabela `donations` com status `paid`.
5. Se o registro já existir (para evitar duplicidade), a função apenas confirma o sucesso.

## Solução de Problemas

- **Erro de Timeout:** Se a função demorar muito, o Mercado Pago pode reenviar a notificação. A lógica de idempotência (verificação se já existe) previne doações duplicadas.
- **Erro de Autenticação:** Verifique se o `MERCADO_PAGO_ACCESS_TOKEN` está correto nos Segredos do Supabase.
- **Logs:** Use o Dashboard do Supabase (Edge Functions > Logs) para ver as requisições chegando. Procure por "Detected Mercado Pago Webhook".

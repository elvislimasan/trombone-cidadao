# Guia: Configuração de DNS na Hostinger para Resend

Este guia ajudará você a configurar os registros DNS do seu domínio comprado na **Hostinger** para que o **Resend** possa enviar e-mails em seu nome (ex: `contato@seudominio.com.br`).

## Passo 1: Obter os Registros no Resend

1. Acesse o painel do [Resend](https://resend.com).
2. Vá em **Domains** -> **Add New Domain**.
3. Digite seu domínio (ex: `seudominio.com.br`) e escolha a região (geralmente `us-east-1`).
4. O Resend mostrará uma lista de registros DNS (geralmente 2 TXT e 1 MX). **Não feche esta página.**

## Passo 2: Configurar na Hostinger

1. Faça login no [hPanel da Hostinger](https://hpanel.hostinger.com).
2. No menu superior, clique em **Domínios**.
3. Clique em **Gerenciar** ao lado do domínio que você quer configurar.
4. No menu lateral esquerdo, vá em **DNS / Nameservers**.
5. Você verá a seção **Gerenciar registros DNS**. É aqui que você adicionará os dados do Resend.

### Adicionando os Registros

Para cada registro que o Resend forneceu, siga este padrão na Hostinger:

#### 1. Registros TXT (DKIM e SPF)
- **Tipo**: Selecione `TXT`.
- **Nome (Host)**: Copie o valor da coluna "Name" do Resend. 
    - *Nota: Se o Resend mostrar `resend._domainkey.seudominio.com.br`, a Hostinger pode aceitar apenas `resend._domainkey`.*
- **Valor TXT**: Copie o valor longo da coluna "Value" do Resend.
- **TTL**: Pode deixar o padrão (geralmente 14400 ou 3600).
- Clique em **Adicionar Registro**.

#### 2. Registro MX (Verificação)
- **Tipo**: Selecione `MX`.
- **Nome (Host)**: Geralmente `@` ou o nome do seu domínio.
- **Servidor de E-mail**: Copie o valor de "Value" do Resend (ex: `feedback-smtp.us-east-1.amazonses.com`).
- **Prioridade**: Defina como `10` (ou o que o Resend indicar).
- Clique em **Adicionar Registro**.

## Passo 3: Verificar no Resend

1. Volte ao painel do Resend.
2. Clique no botão **Verify** ou **Check Status**.
3. **Atenção**: As alterações de DNS podem levar de 5 minutos até 24 horas para propagar pela internet (na Hostinger costuma ser rápido, cerca de 15-30 min).
4. Quando o status mudar para **Verified** (verde), seu domínio está pronto para produção!

## Passo 4: Atualizar o Supabase

Após o domínio estar verificado, não esqueça de atualizar a variável de ambiente no Supabase:

1. Vá em **Edge Functions** -> **Settings** -> **Environment Variables**.
2. Altere `RESEND_FROM_EMAIL` para: `Nome do Site <contato@seudominio.com.br>`.

---
*Dica: Se você já tiver outros registros MX (de um serviço de e-mail atual como Outlook ou Gmail), não apague-os! Apenas adicione o do Resend conforme solicitado.*
